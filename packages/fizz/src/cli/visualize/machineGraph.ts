import { basename, dirname, extname, resolve } from "node:path"

import type {
  CallExpression,
  Expression,
  Identifier,
  ImportClause,
  ImportSpecifier,
  ObjectLiteralExpression,
  SourceFile,
} from "ts-morph"
import { Node, Project, SyntaxKind } from "ts-morph"

export type MachineCandidate = {
  name: string
  sourceFilePath: string
  stateIndexPath: string
}

export type MachineTransition = {
  action: string
  kind: "normal" | "self" | "special"
  note?: string
  target: string
}

export type MachineState = {
  filePath: string
  kind: "nested-parent" | "nested-state" | "state"
  name: string
  nestedInitialState?: string
  nestedParentState?: string
  notes: Array<string>
  outputs: Array<string>
  transitions: Array<MachineTransition>
}

export type MachineGraph = {
  entryState: string
  name: string
  sourceFilePath: string
  stateIndexPath: string
  states: Array<MachineState>
}

type GraphBuilderContext = {
  project: Project
  stateCache: Map<string, MachineState>
}

type MachineEntry = {
  callExpression: CallExpression
  definitionObject: ObjectLiteralExpression
  sourceFilePath: string
  symbolName?: string
}

type StateEntry = {
  callExpression?: CallExpression
  filePath: string
  id: string
  nameHint: string
  referenceKey?: string
}

const SPECIAL_HISTORY_NODE = "History"

const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  "__tests__",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "test-npm-version",
])

const toPascalCase = (value: string): string =>
  value
    .replace(/\.[^.]+$/, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(part => part.length > 0)
    .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("")

const fileStem = (filePath: string): string =>
  basename(filePath, extname(filePath))

const pathContainsIgnoredDirectory = (pathValue: string): boolean =>
  pathValue
    .split(/[\\/]/)
    .some(pathSegment => IGNORED_DIRECTORY_NAMES.has(pathSegment))

const collectSourceFiles = async (rootDir: string): Promise<Array<string>> => {
  const fs = await import("node:fs/promises")

  const visit = async (directoryPath: string): Promise<Array<string>> => {
    if (pathContainsIgnoredDirectory(directoryPath)) {
      return []
    }

    const directoryEntries = await fs.readdir(directoryPath, {
      withFileTypes: true,
    })
    const nestedPaths = await Promise.all(
      directoryEntries
        .filter(entry => !entry.name.startsWith("."))
        .map(async entry => {
          const absolutePath = resolve(directoryPath, entry.name)

          if (entry.isSymbolicLink()) {
            return []
          }

          if (entry.isDirectory()) {
            if (IGNORED_DIRECTORY_NAMES.has(entry.name)) {
              return []
            }

            return visit(absolutePath)
          }

          return /\.(ts|tsx|js|jsx)$/.test(entry.name) &&
            !entry.name.endsWith(".d.ts")
            ? [absolutePath]
            : []
        }),
    )

    return nestedPaths.flat().sort((left, right) => left.localeCompare(right))
  }

  return visit(rootDir)
}

const resolveModulePath = (
  sourceFile: SourceFile,
  moduleSpecifier: string,
): string | undefined => {
  if (!moduleSpecifier.startsWith(".")) {
    return undefined
  }

  const sourceDirectory = dirname(sourceFile.getFilePath())
  const basePath = resolve(sourceDirectory, moduleSpecifier)
  const candidates = [
    basePath,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    basePath.replace(/\.js$/, ".ts"),
    basePath.replace(/\.js$/, ".tsx"),
    resolve(basePath, "index.js"),
    resolve(basePath, "index.jsx"),
    resolve(basePath, "index.ts"),
    resolve(basePath, "index.tsx"),
  ]

  return candidates.find(candidate =>
    sourceFile.getProject().getSourceFile(candidate),
  )
}

const getDeclarationKey = (declaration: Node): string =>
  `${declaration.getSourceFile().getFilePath()}:${declaration.getStart()}`

const getDefaultExportExpression = (
  sourceFile: SourceFile,
): Expression | undefined => {
  const exportAssignment = sourceFile
    .getExportAssignments()
    .find(assignment => !assignment.isExportEquals())

  return exportAssignment?.getExpression()
}

const isReferenceToNamedImport = (
  identifier: Identifier,
  importName: string,
): boolean => {
  const symbol =
    identifier.getSymbol()?.getAliasedSymbol() ?? identifier.getSymbol()
  const declarations = symbol?.getDeclarations() ?? []

  return declarations.some(declaration => {
    if (!Node.isImportSpecifier(declaration)) {
      return false
    }

    return declaration.getNameNode().getText() === importName
  })
}

const isCallToNamedFunction = (
  callExpression: CallExpression,
  name: string,
): boolean => {
  const expression = callExpression.getExpression()

  if (!Node.isIdentifier(expression)) {
    return false
  }

  return (
    expression.getText() === name || isReferenceToNamedImport(expression, name)
  )
}

const resolveExportedExpression = (
  sourceFile: SourceFile,
  exportName: string,
  visitedDeclarationKeys: Set<string>,
): Expression | undefined => {
  const exportedDeclarations =
    sourceFile.getExportedDeclarations().get(exportName) ?? []

  return exportedDeclarations
    .map(declaration =>
      resolveDeclarationToExpression(declaration, visitedDeclarationKeys),
    )
    .find(expression => expression !== undefined)
}

const getImportedSourceFile = (
  sourceFile: SourceFile,
  moduleSpecifier: string,
): SourceFile | undefined => {
  const modulePath = resolveModulePath(sourceFile, moduleSpecifier)

  return modulePath
    ? sourceFile.getProject().getSourceFile(modulePath)
    : undefined
}

const resolveImportSpecifierExpression = (
  declaration: ImportSpecifier,
  visitedDeclarationKeys: Set<string>,
): Expression | undefined => {
  const importDeclaration = declaration.getImportDeclaration()
  const importedSourceFile = getImportedSourceFile(
    importDeclaration.getSourceFile(),
    importDeclaration.getModuleSpecifierValue(),
  )

  if (!importedSourceFile) {
    return undefined
  }

  return resolveExportedExpression(
    importedSourceFile,
    declaration.getNameNode().getText(),
    visitedDeclarationKeys,
  )
}

const resolveImportClauseExpression = (
  declaration: ImportClause,
  visitedDeclarationKeys: Set<string>,
): Expression | undefined => {
  const importDeclaration = declaration.getFirstAncestorByKind(
    SyntaxKind.ImportDeclaration,
  )

  if (!importDeclaration) {
    return undefined
  }

  const importedSourceFile = getImportedSourceFile(
    importDeclaration.getSourceFile(),
    importDeclaration.getModuleSpecifierValue(),
  )

  if (!importedSourceFile) {
    return undefined
  }

  return resolveExportedExpression(
    importedSourceFile,
    "default",
    visitedDeclarationKeys,
  )
}

const resolveIdentifierDeclarationExpression = (
  declaration: Node,
  visitedDeclarationKeys: Set<string>,
): Expression | undefined => {
  if (!Node.isIdentifier(declaration)) {
    return undefined
  }

  const importClause = declaration.getFirstAncestorByKind(
    SyntaxKind.ImportClause,
  )

  if (importClause) {
    return resolveImportClauseExpression(importClause, visitedDeclarationKeys)
  }

  const importSpecifier = declaration.getFirstAncestorByKind(
    SyntaxKind.ImportSpecifier,
  )

  if (importSpecifier) {
    return resolveImportSpecifierExpression(
      importSpecifier,
      visitedDeclarationKeys,
    )
  }

  const variableDeclaration = declaration.getFirstAncestorByKind(
    SyntaxKind.VariableDeclaration,
  )

  if (!variableDeclaration) {
    return undefined
  }

  const initializer = variableDeclaration.getInitializer()

  return initializer && Node.isExpression(initializer) ? initializer : undefined
}

const resolveDeclarationToExpression = (
  declaration: Node,
  visitedDeclarationKeys: Set<string>,
): Expression | undefined => {
  const declarationKey = getDeclarationKey(declaration)

  if (visitedDeclarationKeys.has(declarationKey)) {
    return undefined
  }

  visitedDeclarationKeys.add(declarationKey)

  if (Node.isVariableDeclaration(declaration)) {
    const initializer = declaration.getInitializer()

    return initializer && Node.isExpression(initializer)
      ? initializer
      : undefined
  }

  if (Node.isExportAssignment(declaration)) {
    return declaration.getExpression()
  }

  if (Node.isImportSpecifier(declaration)) {
    return resolveImportSpecifierExpression(declaration, visitedDeclarationKeys)
  }

  if (Node.isImportClause(declaration)) {
    return resolveImportClauseExpression(declaration, visitedDeclarationKeys)
  }

  return resolveIdentifierDeclarationExpression(
    declaration,
    visitedDeclarationKeys,
  )
}

const resolveIdentifierExpression = (
  identifier: Identifier,
  visitedDeclarationKeys: Set<string>,
): Expression | undefined => {
  const symbol =
    identifier.getSymbol()?.getAliasedSymbol() ?? identifier.getSymbol()
  const declarations = symbol?.getDeclarations() ?? []

  return declarations
    .map(declaration =>
      resolveDeclarationToExpression(declaration, visitedDeclarationKeys),
    )
    .find(expression => expression !== undefined)
}

const resolveExpressionValue = (
  expression: Expression,
  visitedDeclarationKeys: Set<string> = new Set<string>(),
): Expression => {
  if (!Node.isIdentifier(expression)) {
    return expression
  }

  const resolved = resolveIdentifierExpression(
    expression,
    visitedDeclarationKeys,
  )

  if (!resolved || resolved === expression) {
    return expression
  }

  return resolveExpressionValue(resolved, visitedDeclarationKeys)
}

const getObjectPropertyExpression = (
  property: Node,
): Expression | undefined => {
  if (Node.isShorthandPropertyAssignment(property)) {
    return property.getNameNode()
  }

  if (Node.isPropertyAssignment(property)) {
    const initializer = property.getInitializer()

    return initializer && Node.isExpression(initializer)
      ? initializer
      : undefined
  }

  return undefined
}

const getMachineDefinitionObject = (
  callExpression: CallExpression,
): ObjectLiteralExpression | undefined => {
  const [firstArgument] = callExpression?.getArguments() ?? []

  return firstArgument && Node.isObjectLiteralExpression(firstArgument)
    ? firstArgument
    : undefined
}

const getMachineDefinitionIdentifier = (
  definitionObject: ObjectLiteralExpression,
  propertyName: string,
): Identifier | undefined => {
  const property = definitionObject.getProperty(propertyName)

  if (!property) {
    return undefined
  }

  return getNamedObjectPropertyIdentifier(property)
}

const getMachineStateIndexPath = (
  machineEntry: MachineEntry,
): string | undefined => {
  const statesIdentifier = getMachineDefinitionIdentifier(
    machineEntry.definitionObject,
    "states",
  )

  if (statesIdentifier) {
    return getSourceFilePathForIdentifier(statesIdentifier)
  }

  const statesProperty = machineEntry.definitionObject.getProperty("states")

  if (!statesProperty) {
    return undefined
  }

  const statesExpression = getObjectPropertyExpression(statesProperty)

  if (!statesExpression) {
    return undefined
  }

  const resolvedStatesExpression = resolveExpressionValue(statesExpression)

  return Node.isObjectLiteralExpression(resolvedStatesExpression)
    ? machineEntry.sourceFilePath
    : undefined
}

const getMachineName = (machineEntry: MachineEntry): string => {
  const callExpression = machineEntry.callExpression
  const [, nameArgument] = callExpression?.getArguments() ?? []

  const explicitName = getStringLiteralValue(nameArgument)

  if (explicitName) {
    return explicitName
  }

  const definitionObject = machineEntry.definitionObject

  const nameProperty = definitionObject.getProperty("name")

  if (!nameProperty || !Node.isPropertyAssignment(nameProperty)) {
    return (
      machineEntry.symbolName ??
      createCandidateName(machineEntry.sourceFilePath)
    )
  }

  return (
    getStringLiteralValue(nameProperty.getInitializer()) ??
    machineEntry.symbolName ??
    createCandidateName(machineEntry.sourceFilePath)
  )
}

const getVariableDeclarationName = (
  callExpression: CallExpression,
): string | undefined => {
  const declaration = callExpression.getFirstAncestorByKind(
    SyntaxKind.VariableDeclaration,
  )

  if (declaration?.getInitializer() !== callExpression) {
    return undefined
  }

  return declaration.getName()
}

const isNestedInFunctionLike = (callExpression: CallExpression): boolean =>
  Boolean(
    callExpression.getFirstAncestor(
      ancestor =>
        Node.isArrowFunction(ancestor) ||
        Node.isFunctionDeclaration(ancestor) ||
        Node.isFunctionExpression(ancestor) ||
        Node.isMethodDeclaration(ancestor),
    ),
  )

const getMachineEntriesForSourceFile = (
  sourceFile: SourceFile,
): Array<MachineEntry> =>
  sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .flatMap(callExpression => {
      if (!isCallToNamedFunction(callExpression, "createMachine")) {
        return []
      }

      if (isNestedInFunctionLike(callExpression)) {
        return []
      }

      const definitionObject = getMachineDefinitionObject(callExpression)

      if (!definitionObject) {
        return []
      }

      return [
        {
          callExpression,
          definitionObject,
          sourceFilePath: sourceFile.getFilePath(),
          symbolName: getVariableDeclarationName(callExpression),
        },
      ]
    })

const findNestedStateIndexPath = (
  stateFilePath: string,
): string | undefined => {
  const nestedStateDirectory = dirname(stateFilePath)

  return resolve(nestedStateDirectory, "index.ts")
}

const getNestedStateEntriesForStateFile = (
  project: Project,
  stateFilePath: string,
): Array<{ filePath: string }> => {
  const sourceFile = project.getSourceFileOrThrow(stateFilePath)
  const callExpression = getStateCallForSourceFile(sourceFile)

  if (!callExpression) {
    return []
  }

  const expression = callExpression.getExpression()

  if (
    !Node.isIdentifier(expression) ||
    expression.getText() !== "stateWithNested"
  ) {
    return []
  }

  const [, nestedInitialArgument] = callExpression.getArguments()

  if (!nestedInitialArgument || !Node.isCallExpression(nestedInitialArgument)) {
    return []
  }

  const nestedInitialIdentifier = nestedInitialArgument.getExpression()

  if (!Node.isIdentifier(nestedInitialIdentifier)) {
    return []
  }

  const nestedInitialStatePath = getSourceFilePathForIdentifier(
    nestedInitialIdentifier,
  )

  if (!nestedInitialStatePath) {
    return []
  }

  const nestedStateIndexPath = findNestedStateIndexPath(nestedInitialStatePath)
  const nestedStateIndexFile = nestedStateIndexPath
    ? project.getSourceFile(nestedStateIndexPath)
    : undefined

  return nestedStateIndexFile
    ? extractStateEntriesFromStateIndex(nestedStateIndexFile)
    : []
}

const createCandidateName = (sourceFilePath: string): string => {
  const stem = fileStem(sourceFilePath)
  const directoryName = basename(dirname(sourceFilePath))

  return toPascalCase(stem === "index" ? directoryName : stem)
}

const getNamedObjectPropertyIdentifier = (
  property: Node,
): Identifier | undefined => {
  if (Node.isShorthandPropertyAssignment(property)) {
    return property.getNameNode()
  }

  if (Node.isPropertyAssignment(property)) {
    const initializer = property.getInitializer()

    return initializer && Node.isIdentifier(initializer)
      ? initializer
      : undefined
  }

  return undefined
}

const getReferenceKeyForIdentifier = (
  identifier: Identifier,
): string | undefined => {
  const symbol =
    identifier.getSymbol()?.getAliasedSymbol() ?? identifier.getSymbol()
  const declarations = symbol?.getDeclarations() ?? []
  const variableDeclaration = declarations.find(declaration =>
    Node.isVariableDeclaration(declaration),
  )

  if (variableDeclaration && Node.isVariableDeclaration(variableDeclaration)) {
    return `${variableDeclaration
      .getSourceFile()
      .getFilePath()}::${variableDeclaration.getName()}`
  }

  return undefined
}

const isStateCallExpression = (callExpression: CallExpression): boolean => {
  const expression = callExpression.getExpression()

  if (!Node.isIdentifier(expression)) {
    return false
  }

  return (
    expression.getText() === "state" ||
    expression.getText() === "stateWithNested" ||
    isReferenceToNamedImport(expression, "state") ||
    isReferenceToNamedImport(expression, "stateWithNested")
  )
}

const resolveStateEntryFromExpression = (
  expression: Expression,
  nameHint: string,
): Array<StateEntry> => {
  const resolvedExpression = resolveExpressionValue(expression)
  const referenceKey = Node.isIdentifier(expression)
    ? getReferenceKeyForIdentifier(expression)
    : undefined

  if (Node.isCallExpression(resolvedExpression)) {
    if (!isStateCallExpression(resolvedExpression)) {
      return []
    }

    return [
      {
        callExpression: resolvedExpression,
        filePath: resolvedExpression.getSourceFile().getFilePath(),
        id: `${resolvedExpression
          .getSourceFile()
          .getFilePath()}:${resolvedExpression.getStart()}`,
        nameHint,
        ...(referenceKey === undefined ? {} : { referenceKey }),
      },
    ]
  }

  return []
}

const resolveStateEntriesFromStatesExpression = (
  expression: Expression,
): Array<StateEntry> => {
  const resolvedExpression = resolveExpressionValue(expression)

  if (!Node.isObjectLiteralExpression(resolvedExpression)) {
    return []
  }

  return resolvedExpression.getProperties().flatMap((property, index) => {
    const stateExpression = getObjectPropertyExpression(property)

    if (!stateExpression) {
      return []
    }

    const nameHint =
      (Node.isPropertyAssignment(property) ||
        Node.isShorthandPropertyAssignment(property)) &&
      property.getName()
        ? property.getName()
        : `State${index + 1}`

    return resolveStateEntryFromExpression(stateExpression, nameHint)
  })
}

const getStateEntriesForMachineEntry = (
  machineEntry: MachineEntry,
): Array<StateEntry> => {
  const statesProperty = machineEntry.definitionObject.getProperty("states")

  if (!statesProperty) {
    return []
  }

  const statesExpression = getObjectPropertyExpression(statesProperty)

  if (!statesExpression) {
    return []
  }

  const directStateEntries =
    resolveStateEntriesFromStatesExpression(statesExpression)

  if (directStateEntries.length > 0) {
    return directStateEntries
  }

  const statesIdentifier = getMachineDefinitionIdentifier(
    machineEntry.definitionObject,
    "states",
  )
  const stateIndexPath = statesIdentifier
    ? getSourceFilePathForIdentifier(statesIdentifier)
    : undefined
  const stateIndexFile = stateIndexPath
    ? machineEntry.callExpression
        .getSourceFile()
        .getProject()
        .getSourceFile(stateIndexPath)
    : undefined

  return stateIndexFile ? extractStateEntriesFromStateIndex(stateIndexFile) : []
}

const extractInlineStateEntriesForMachineCandidate = (
  sourceFile: SourceFile,
  machineName: string,
): Array<StateEntry> => {
  const machineEntry = getMachineEntriesForSourceFile(sourceFile).find(
    entry => getMachineName(entry) === machineName,
  )

  if (!machineEntry) {
    return []
  }

  const statesProperty = machineEntry.definitionObject.getProperty("states")

  if (!statesProperty) {
    return []
  }

  const statesExpression = getObjectPropertyExpression(statesProperty)

  if (!statesExpression || !Node.isObjectLiteralExpression(statesExpression)) {
    return []
  }

  return statesExpression.getProperties().flatMap((property, index) => {
    const nameHint =
      (Node.isPropertyAssignment(property) ||
        Node.isShorthandPropertyAssignment(property)) &&
      property.getName()
        ? property.getName()
        : `State${index + 1}`
    const expression = getObjectPropertyExpression(property)

    if (!expression) {
      return []
    }

    const resolvedCallExpression = Node.isIdentifier(expression)
      ? sourceFile
          .getVariableDeclarations()
          .find(declaration => declaration.getName() === expression.getText())
          ?.getInitializer()
      : expression

    if (
      !resolvedCallExpression ||
      !Node.isCallExpression(resolvedCallExpression) ||
      !isStateCallExpression(resolvedCallExpression)
    ) {
      return []
    }

    const referenceKey = Node.isIdentifier(expression)
      ? `${sourceFile.getFilePath()}::${expression.getText()}`
      : undefined

    return [
      {
        callExpression: resolvedCallExpression,
        filePath: sourceFile.getFilePath(),
        id: `${sourceFile.getFilePath()}:${resolvedCallExpression.getStart()}`,
        nameHint,
        ...(referenceKey ? { referenceKey } : {}),
      },
    ]
  })
}

const extractClassicStateFilePathsFromStateIndex = (
  sourceFile: SourceFile,
): Array<string> => {
  const expression = getDefaultExportExpression(sourceFile)

  if (Node.isObjectLiteralExpression(expression)) {
    return expression.getProperties().flatMap(property => {
      const identifier = getNamedObjectPropertyIdentifier(property)

      if (!identifier) {
        return []
      }

      const definitionFilePath = getSourceFilePathForIdentifier(identifier)

      return definitionFilePath ? [definitionFilePath] : []
    })
  }

  const namedExportEntries = sourceFile
    .getExportDeclarations()
    .flatMap(exportDeclaration =>
      exportDeclaration.getNamedExports().flatMap(exportSpecifier => {
        const identifier =
          exportSpecifier.getAliasNode() ?? exportSpecifier.getNameNode()

        if (!Node.isIdentifier(identifier)) {
          return []
        }

        const definitionFilePath = getSourceFilePathForIdentifier(identifier)

        return definitionFilePath ? [definitionFilePath] : []
      }),
    )

  return Array.from(new Set(namedExportEntries))
}

const extractStateEntriesFromStateIndex = (
  sourceFile: SourceFile,
): Array<StateEntry> => {
  const machineEntries = getMachineEntriesForSourceFile(sourceFile)

  if (machineEntries.length > 0) {
    const machineStateEntries = getStateEntriesForMachineEntry(
      machineEntries[0],
    )

    if (machineStateEntries.length > 0) {
      return machineStateEntries
    }
  }

  const defaultExportExpression = sourceFile
    .getExportAssignments()
    .find(assignment => !assignment.isExportEquals())
    ?.getExpression()
  const expression = defaultExportExpression
    ? resolveExpressionValue(defaultExportExpression)
    : undefined

  if (Node.isObjectLiteralExpression(expression)) {
    return expression.getProperties().flatMap(property => {
      const stateExpression = getObjectPropertyExpression(property)

      if (!stateExpression) {
        return []
      }

      return resolveStateEntryFromExpression(
        stateExpression,
        Node.isPropertyAssignment(property) ||
          Node.isShorthandPropertyAssignment(property)
          ? property.getName()
          : "State",
      )
    })
  }

  const namedExportEntries = sourceFile
    .getExportDeclarations()
    .flatMap(exportDeclaration =>
      exportDeclaration.getNamedExports().flatMap(exportSpecifier => {
        const identifier =
          exportSpecifier.getAliasNode() ?? exportSpecifier.getNameNode()

        if (!Node.isIdentifier(identifier)) {
          return []
        }

        return resolveStateEntryFromExpression(identifier, identifier.getText())
      }),
    )

  return Array.from(
    new Map(namedExportEntries.map(entry => [entry.id, entry])).values(),
  )
}

const getStringLiteralValue = (
  expression: Node | undefined,
): string | undefined =>
  expression && Node.isStringLiteral(expression)
    ? expression.getLiteralValue()
    : undefined

const getImportedModulePathForIdentifier = (
  identifier: Identifier,
): string | undefined => {
  const identifierName = identifier.getText()
  const sourceFile = identifier.getSourceFile()

  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const defaultImport = importDeclaration.getDefaultImport()

    if (defaultImport?.getText() === identifierName) {
      return resolveModulePath(
        sourceFile,
        importDeclaration.getModuleSpecifierValue(),
      )
    }

    const namedImport = importDeclaration
      .getNamedImports()
      .find(
        importSpecifier =>
          importSpecifier.getAliasNode()?.getText() === identifierName ||
          importSpecifier.getNameNode().getText() === identifierName,
      )

    if (namedImport) {
      return resolveModulePath(
        sourceFile,
        importDeclaration.getModuleSpecifierValue(),
      )
    }
  }

  return undefined
}

const getResolvedDeclarationFilePath = (
  declaration: Node,
): string | undefined => {
  const importDeclaration = declaration.getFirstAncestorByKind(
    SyntaxKind.ImportDeclaration,
  )

  if (importDeclaration) {
    return resolveModulePath(
      importDeclaration.getSourceFile(),
      importDeclaration.getModuleSpecifierValue(),
    )
  }

  return declaration.getSourceFile().getFilePath()
}

const getSourceFilePathForIdentifier = (
  identifier: Identifier,
): string | undefined => {
  const importedModulePath = getImportedModulePathForIdentifier(identifier)

  if (importedModulePath) {
    return importedModulePath
  }

  const symbol =
    identifier.getSymbol()?.getAliasedSymbol() ?? identifier.getSymbol()
  const declarations = symbol?.getDeclarations() ?? []

  return declarations
    .map(declaration => getResolvedDeclarationFilePath(declaration))
    .find(filePath => filePath !== undefined)
}

const getCallIdentifierName = (
  callExpression: CallExpression,
): string | undefined => {
  const expression = callExpression.getExpression()

  return Node.isIdentifier(expression) ? expression.getText() : undefined
}

const getNestedCallExpression = (
  callExpression: CallExpression,
): CallExpression | undefined => {
  const expression = callExpression.getExpression()

  if (!Node.isPropertyAccessExpression(expression)) {
    return undefined
  }

  const nestedCallExpression = expression.getExpression()

  return Node.isCallExpression(nestedCallExpression)
    ? nestedCallExpression
    : undefined
}

const getActionNameFromCallExpression = (
  callExpression: CallExpression,
): string | undefined => {
  let currentCallExpression: CallExpression | undefined = callExpression

  while (currentCallExpression) {
    const expression = currentCallExpression.getExpression()

    if (Node.isIdentifier(expression) && expression.getText() === "action") {
      const [firstArgument] = currentCallExpression.getArguments()

      return firstArgument ? getStringLiteralValue(firstArgument) : undefined
    }

    currentCallExpression = getNestedCallExpression(currentCallExpression)
  }

  return undefined
}

const getActionCreatorNameFromIdentifier = (
  identifier: Identifier,
): string | undefined => {
  const symbol =
    identifier.getSymbol()?.getAliasedSymbol() ?? identifier.getSymbol()
  const declarations = symbol?.getDeclarations() ?? []

  for (const declaration of declarations) {
    if (!Node.isVariableDeclaration(declaration)) {
      continue
    }

    const initializer = declaration.getInitializer()

    if (!initializer || !Node.isCallExpression(initializer)) {
      continue
    }

    const actionName = getActionNameFromCallExpression(initializer)

    if (actionName) {
      return actionName
    }
  }

  return undefined
}

const getExplicitStateName = (
  callExpression: CallExpression,
  fallbackName: string,
): string => {
  const optionArgument = callExpression
    .getArguments()
    .find(
      argument =>
        Node.isObjectLiteralExpression(argument) &&
        argument.getProperty("name") !== undefined,
    )

  if (!optionArgument || !Node.isObjectLiteralExpression(optionArgument)) {
    return fallbackName
  }

  const nameProperty = optionArgument.getProperty("name")

  if (!nameProperty || !Node.isPropertyAssignment(nameProperty)) {
    return fallbackName
  }

  return getStringLiteralValue(nameProperty.getInitializer()) ?? fallbackName
}

const analyzeExpression = (
  expression: Expression,
  currentStateName: string,
  knownStatesByReferenceKey: Map<string, string>,
  knownStatesByFilePath: Map<string, string>,
  outputs: Set<string>,
  notes: Set<string>,
): {
  emittedActions: Set<string>
  specialTargets: Set<string>
  targets: Set<string>
} => {
  const emittedActions = new Set<string>()
  const specialTargets = new Set<string>()
  const targets = new Set<string>()

  const recordIdentifier = (identifier: Identifier): void => {
    const actionCreatorName = getActionCreatorNameFromIdentifier(identifier)

    if (actionCreatorName) {
      emittedActions.add(actionCreatorName)
      notes.add(`dispatches ${actionCreatorName}`)
    }

    if (identifier.getText() === "goBack") {
      specialTargets.add(SPECIAL_HISTORY_NODE)
      notes.add("uses goBack")
    }
  }

  const visitSequence = (expressions: Array<Expression>): void => {
    expressions.forEach(item => visit(item))
  }

  const visitNonCallExpression = (node: Expression): boolean => {
    if (Node.isArrayLiteralExpression(node)) {
      visitSequence(
        node
          .getElements()
          .flatMap(element => (Node.isExpression(element) ? [element] : [])),
      )
      return true
    }

    if (Node.isAwaitExpression(node)) {
      visit(node.getExpression())
      return true
    }

    if (Node.isConditionalExpression(node)) {
      visitSequence([node.getWhenTrue(), node.getWhenFalse()])
      return true
    }

    if (Node.isParenthesizedExpression(node)) {
      visit(node.getExpression())
      return true
    }

    if (Node.isIdentifier(node)) {
      recordIdentifier(node)
      return true
    }

    return false
  }

  const visitOutputCall = (node: CallExpression): boolean => {
    if (getCallIdentifierName(node) !== "output") {
      return false
    }

    const [firstArgument] = node.getArguments()

    if (firstArgument && Node.isCallExpression(firstArgument)) {
      const outputIdentifier = firstArgument.getExpression()

      if (Node.isIdentifier(outputIdentifier)) {
        const outputName = getActionCreatorNameFromIdentifier(outputIdentifier)

        if (outputName) {
          outputs.add(outputName)
        }
      }
    }

    notes.add("emits output")

    return true
  }

  const visitSpecialTransitionCall = (node: CallExpression): boolean => {
    const callIdentifierName = getCallIdentifierName(node)

    if (callIdentifierName === "update") {
      targets.add(currentStateName)
      return true
    }

    if (callIdentifierName === "goBack") {
      specialTargets.add(SPECIAL_HISTORY_NODE)
      notes.add("uses goBack")
      return true
    }

    return false
  }

  const visitStateTargetCall = (node: CallExpression): boolean => {
    const expressionNode = node.getExpression()

    if (!Node.isIdentifier(expressionNode)) {
      return false
    }

    recordIdentifier(expressionNode)

    const referenceKey = getReferenceKeyForIdentifier(expressionNode)
    const stateFilePath = getSourceFilePathForIdentifier(expressionNode)
    const targetStateName =
      (referenceKey
        ? knownStatesByReferenceKey.get(referenceKey)
        : undefined) ??
      (stateFilePath ? knownStatesByFilePath.get(stateFilePath) : undefined)

    if (!targetStateName) {
      return false
    }

    targets.add(targetStateName)

    return true
  }

  const visit = (node: Expression | undefined): void => {
    if (!node) {
      return
    }

    if (visitNonCallExpression(node)) {
      return
    }

    if (!Node.isCallExpression(node)) {
      return
    }

    if (visitSpecialTransitionCall(node)) {
      return
    }

    if (visitOutputCall(node)) {
      return
    }

    if (visitStateTargetCall(node)) {
      return
    }

    visitSequence(
      node
        .getArguments()
        .flatMap(argument => (Node.isExpression(argument) ? [argument] : [])),
    )
  }

  visit(expression)

  return {
    emittedActions,
    specialTargets,
    targets,
  }
}

const analyzeHandler = (
  property: Node,
  currentStateName: string,
  knownStatesByReferenceKey: Map<string, string>,
  knownStatesByFilePath: Map<string, string>,
): {
  action: string
  outputs: Set<string>
  specialTargets: Set<string>
  targets: Set<string>
  notes: Set<string>
} => {
  const notes = new Set<string>()
  const outputs = new Set<string>()
  let actionName = "Unknown"

  if (
    Node.isMethodDeclaration(property) ||
    Node.isPropertyAssignment(property)
  ) {
    actionName = property.getName()
  }

  if (Node.isMethodDeclaration(property)) {
    const targets = new Set<string>()
    const specialTargets = new Set<string>()

    property
      .getBodyOrThrow()
      .getDescendantsOfKind(SyntaxKind.ReturnStatement)
      .forEach(returnStatement => {
        const expression = returnStatement.getExpression()

        if (!expression) {
          return
        }

        const result = analyzeExpression(
          expression,
          currentStateName,
          knownStatesByReferenceKey,
          knownStatesByFilePath,
          outputs,
          notes,
        )

        result.targets.forEach(target => targets.add(target))
        result.specialTargets.forEach(target => specialTargets.add(target))

        result.emittedActions.forEach(emittedAction => {
          notes.add(`dispatches ${emittedAction}`)
        })
      })

    return {
      action: actionName,
      notes,
      outputs,
      specialTargets,
      targets,
    }
  }

  if (!Node.isPropertyAssignment(property)) {
    return {
      action: actionName,
      notes,
      outputs,
      specialTargets: new Set<string>(),
      targets: new Set<string>(),
    }
  }

  const initializer = property.getInitializer()

  if (!initializer) {
    return {
      action: actionName,
      notes,
      outputs,
      specialTargets: new Set<string>(),
      targets: new Set<string>(),
    }
  }

  if (
    Node.isArrowFunction(initializer) ||
    Node.isFunctionExpression(initializer)
  ) {
    const targets = new Set<string>()
    const specialTargets = new Set<string>()
    const body = initializer.getBody()

    if (Node.isBlock(body)) {
      body
        .getDescendantsOfKind(SyntaxKind.ReturnStatement)
        .forEach(returnStatement => {
          const expression = returnStatement.getExpression()

          if (!expression) {
            return
          }

          const result = analyzeExpression(
            expression,
            currentStateName,
            knownStatesByReferenceKey,
            knownStatesByFilePath,
            outputs,
            notes,
          )

          result.targets.forEach(target => targets.add(target))
          result.specialTargets.forEach(target => specialTargets.add(target))

          result.emittedActions.forEach(emittedAction => {
            notes.add(`dispatches ${emittedAction}`)
          })
        })
    } else {
      if (!Node.isExpression(body)) {
        return {
          action: actionName,
          notes,
          outputs,
          specialTargets,
          targets,
        }
      }

      const result = analyzeExpression(
        body,
        currentStateName,
        knownStatesByReferenceKey,
        knownStatesByFilePath,
        outputs,
        notes,
      )

      result.targets.forEach(target => targets.add(target))
      result.specialTargets.forEach(target => specialTargets.add(target))

      result.emittedActions.forEach(emittedAction => {
        notes.add(`dispatches ${emittedAction}`)
      })
    }

    return {
      action: actionName,
      notes,
      outputs,
      specialTargets,
      targets,
    }
  }

  const result = analyzeExpression(
    initializer,
    currentStateName,
    knownStatesByReferenceKey,
    knownStatesByFilePath,
    outputs,
    notes,
  )

  result.emittedActions.forEach(emittedAction => {
    notes.add(`dispatches ${emittedAction}`)
  })

  return {
    action: actionName,
    notes,
    outputs,
    specialTargets: result.specialTargets,
    targets: result.targets,
  }
}

const getStateCallForSourceFile = (
  sourceFile: SourceFile,
): CallExpression | undefined => {
  const defaultExportExpression = sourceFile
    .getExportAssignments()
    .find(assignment => !assignment.isExportEquals())
    ?.getExpression()
  const resolvedDefaultExpression = defaultExportExpression
    ? resolveExpressionValue(defaultExportExpression)
    : undefined

  if (
    resolvedDefaultExpression &&
    Node.isCallExpression(resolvedDefaultExpression) &&
    isStateCallExpression(resolvedDefaultExpression)
  ) {
    return resolvedDefaultExpression
  }

  return sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find(callExpression => isStateCallExpression(callExpression))
}

const getPreliminaryStateName = (
  project: Project,
  stateEntry: StateEntry,
): string => {
  const sourceFile = project.getSourceFileOrThrow(stateEntry.filePath)
  const callExpression =
    stateEntry.callExpression ?? getStateCallForSourceFile(sourceFile)

  if (!callExpression) {
    return toPascalCase(stateEntry.nameHint)
  }

  return getExplicitStateName(callExpression, toPascalCase(stateEntry.nameHint))
}

const appendTransitions = (
  analysis: MachineState,
  handler: {
    action: string
    outputs: Set<string>
    specialTargets: Set<string>
    targets: Set<string>
    notes: Set<string>
  },
  notes: Set<string>,
  outputs: Set<string>,
): void => {
  handler.targets.forEach(target => {
    analysis.transitions.push({
      action: handler.action,
      kind: target === analysis.name ? "self" : "normal",
      target,
    })
  })

  handler.specialTargets.forEach(target => {
    analysis.transitions.push({
      action: handler.action,
      kind: "special",
      ...(target === SPECIAL_HISTORY_NODE ? { note: "history back" } : {}),
      target,
    })
  })

  handler.outputs.forEach(output => outputs.add(output))
  handler.notes.forEach(note => notes.add(`${handler.action}: ${note}`))
}

const maybeAnalyzeNestedInitialState = (
  context: GraphBuilderContext,
  analysis: MachineState,
  nestedInitialArgument: Node | undefined,
  knownStatesByReferenceKey: Map<string, string>,
  knownStatesByFilePath: Map<string, string>,
  notes: Set<string>,
): void => {
  if (!nestedInitialArgument || !Node.isCallExpression(nestedInitialArgument)) {
    return
  }

  const nestedInitialIdentifier = nestedInitialArgument.getExpression()

  if (!Node.isIdentifier(nestedInitialIdentifier)) {
    return
  }

  const nestedStateFilePath = getSourceFilePathForIdentifier(
    nestedInitialIdentifier,
  )

  if (!nestedStateFilePath) {
    return
  }

  const nestedReferenceKey = getReferenceKeyForIdentifier(
    nestedInitialIdentifier,
  )
  const nestedSourceFile =
    context.project.getSourceFileOrThrow(nestedStateFilePath)
  const nestedStateCall =
    getStateCallForSourceFile(nestedSourceFile) ?? nestedInitialArgument
  const nestedState = analyzeStateFile(
    context,
    {
      callExpression: nestedStateCall,
      filePath: nestedStateFilePath,
      id: nestedReferenceKey ?? `${nestedStateFilePath}:nested`,
      nameHint: nestedInitialIdentifier.getText(),
      ...(nestedReferenceKey ? { referenceKey: nestedReferenceKey } : {}),
    },
    knownStatesByReferenceKey,
    knownStatesByFilePath,
    "nested-state",
    analysis.name,
  )

  analysis.nestedInitialState = nestedState.name
  notes.add(`nested initial state: ${nestedState.name}`)
}

const finalizeStateAnalysis = (
  analysis: MachineState,
  notes: Set<string>,
  outputs: Set<string>,
): MachineState => {
  analysis.notes = Array.from(notes).sort((left, right) =>
    left.localeCompare(right),
  )
  analysis.outputs = Array.from(outputs).sort((left, right) =>
    left.localeCompare(right),
  )

  const sortedTransitions = [...analysis.transitions]

  sortedTransitions.sort((left, right) => {
    const actionComparison = left.action.localeCompare(right.action)

    if (actionComparison === 0) {
      return left.target.localeCompare(right.target)
    }

    return actionComparison
  })

  analysis.transitions = sortedTransitions

  return analysis
}

const analyzeStateFile = (
  context: GraphBuilderContext,
  stateEntry: StateEntry,
  knownStatesByReferenceKey: Map<string, string>,
  knownStatesByFilePath: Map<string, string>,
  kind: MachineState["kind"] = "state",
  nestedParentState?: string,
): MachineState => {
  const cachedState = context.stateCache.get(stateEntry.id)

  if (cachedState) {
    return cachedState
  }

  const sourceFile = context.project.getSourceFileOrThrow(stateEntry.filePath)
  const callExpression =
    stateEntry.callExpression ?? getStateCallForSourceFile(sourceFile)

  if (!callExpression) {
    const fallbackState: MachineState = {
      filePath: stateEntry.filePath,
      kind,
      name: toPascalCase(stateEntry.nameHint),
      ...(nestedParentState === undefined ? {} : { nestedParentState }),
      notes: [],
      outputs: [],
      transitions: [],
    }

    context.stateCache.set(stateEntry.id, fallbackState)
    return fallbackState
  }

  const fallbackName = toPascalCase(stateEntry.nameHint)
  const name = getExplicitStateName(callExpression, fallbackName)
  const expression = callExpression.getExpression()
  const stateKind =
    Node.isIdentifier(expression) && expression.getText() === "stateWithNested"
      ? "nested-parent"
      : kind
  const analysis: MachineState = {
    filePath: stateEntry.filePath,
    kind: stateKind,
    name,
    ...(nestedParentState === undefined ? {} : { nestedParentState }),
    notes: [],
    outputs: [],
    transitions: [],
  }

  context.stateCache.set(stateEntry.id, analysis)
  knownStatesByFilePath.set(stateEntry.filePath, name)
  if (stateEntry.referenceKey) {
    knownStatesByReferenceKey.set(stateEntry.referenceKey, name)
  }

  const [handlersArgument, nestedInitialArgument] =
    callExpression.getArguments()
  const handlers =
    handlersArgument && Node.isObjectLiteralExpression(handlersArgument)
      ? handlersArgument.getProperties()
      : []
  const notes = new Set<string>()
  const outputs = new Set<string>()

  handlers.forEach(property => {
    const handler = analyzeHandler(
      property,
      name,
      knownStatesByReferenceKey,
      knownStatesByFilePath,
    )

    appendTransitions(analysis, handler, notes, outputs)
  })

  if (stateKind === "nested-parent") {
    maybeAnalyzeNestedInitialState(
      context,
      analysis,
      nestedInitialArgument,
      knownStatesByReferenceKey,
      knownStatesByFilePath,
      notes,
    )
  }

  return finalizeStateAnalysis(analysis, notes, outputs)
}

const includeSpecialNodes = (
  states: Array<MachineState>,
): Array<MachineState> => {
  const includesHistoryNode = states.some(state =>
    state.transitions.some(
      transition => transition.target === SPECIAL_HISTORY_NODE,
    ),
  )

  return includesHistoryNode
    ? [
        ...states,
        {
          filePath: "",
          kind: "state",
          name: SPECIAL_HISTORY_NODE,
          notes: ["Synthetic node for goBack transitions"],
          outputs: [],
          transitions: [],
        },
      ]
    : states
}

export const discoverMachineCandidates = {
  collectSourceFiles,
  findCandidates: (
    project: Project,
    rootDir: string,
  ): Array<MachineCandidate> => {
    const candidateMap = new Map<string, MachineCandidate>()

    project.getSourceFiles().forEach(sourceFile => {
      if (!sourceFile.getFilePath().startsWith(rootDir)) {
        return
      }

      getMachineEntriesForSourceFile(sourceFile).forEach(machineEntry => {
        const stateEntries = getStateEntriesForMachineEntry(machineEntry)
        const stateIndexPath =
          getMachineStateIndexPath(machineEntry) ??
          stateEntries[0]?.filePath ??
          sourceFile.getFilePath()

        const candidate: MachineCandidate = {
          name: getMachineName(machineEntry),
          sourceFilePath: machineEntry.sourceFilePath,
          stateIndexPath,
        }

        candidateMap.set(
          `${candidate.sourceFilePath}:${candidate.name}:${candidate.stateIndexPath}`,
          candidate,
        )
      })
    })

    return Array.from(candidateMap.values()).sort((left, right) =>
      left.name.localeCompare(right.name),
    )
  },
}

export const buildMachineGraph = (
  project: Project,
  candidate: MachineCandidate,
): MachineGraph => {
  const context: GraphBuilderContext = {
    project,
    stateCache: new Map<string, MachineState>(),
  }
  const machineSourceFile = project.getSourceFile(candidate.sourceFilePath)
  const matchingMachineEntry = machineSourceFile
    ? getMachineEntriesForSourceFile(machineSourceFile).find(machineEntry => {
        const machineName = getMachineName(machineEntry)
        const stateIndexPath =
          getMachineStateIndexPath(machineEntry) ?? machineEntry.sourceFilePath

        return (
          machineName === candidate.name &&
          stateIndexPath === candidate.stateIndexPath
        )
      })
    : undefined
  const machineStateEntries = matchingMachineEntry
    ? getStateEntriesForMachineEntry(matchingMachineEntry)
    : []
  let stateEntries: Array<StateEntry>

  if (machineStateEntries.length > 0) {
    stateEntries = machineStateEntries
  } else if (candidate.stateIndexPath === candidate.sourceFilePath) {
    stateEntries = extractStateEntriesFromStateIndex(
      project.getSourceFileOrThrow(candidate.stateIndexPath),
    )

    if (stateEntries.length === 0) {
      stateEntries = extractInlineStateEntriesForMachineCandidate(
        project.getSourceFileOrThrow(candidate.sourceFilePath),
        candidate.name,
      )
    }
  } else {
    stateEntries = extractClassicStateFilePathsFromStateIndex(
      project.getSourceFileOrThrow(candidate.stateIndexPath),
    ).map((filePath, index) => ({
      callExpression: getStateCallForSourceFile(
        project.getSourceFileOrThrow(filePath),
      ),
      filePath,
      id: `${filePath}:${index}`,
      nameHint: fileStem(filePath),
    }))
  }
  const knownStatesByReferenceKey = new Map<string, string>()
  const knownStatesByFilePath = new Map<string, string>(
    stateEntries.map(entry => [
      entry.filePath,
      getPreliminaryStateName(project, entry),
    ]),
  )
  stateEntries.forEach(entry => {
    if (entry.referenceKey) {
      knownStatesByReferenceKey.set(
        entry.referenceKey,
        getPreliminaryStateName(project, entry),
      )
    }
  })

  stateEntries.forEach(entry => {
    getNestedStateEntriesForStateFile(project, entry.filePath).forEach(
      nestedEntry => {
        knownStatesByFilePath.set(
          nestedEntry.filePath,
          getPreliminaryStateName(project, {
            callExpression: getStateCallForSourceFile(
              project.getSourceFileOrThrow(nestedEntry.filePath),
            ),
            filePath: nestedEntry.filePath,
            id: `${nestedEntry.filePath}:nested`,
            nameHint: fileStem(nestedEntry.filePath),
          }),
        )
      },
    )
  })

  const analyzedStates = stateEntries.flatMap(entry => {
    const analyzedState = analyzeStateFile(
      context,
      entry,
      knownStatesByReferenceKey,
      knownStatesByFilePath,
      "state",
    )

    if (!analyzedState.nestedInitialState) {
      return [analyzedState]
    }

    const nestedStates = getNestedStateEntriesForStateFile(
      project,
      entry.filePath,
    ).map(nestedEntry =>
      analyzeStateFile(
        context,
        {
          callExpression: getStateCallForSourceFile(
            project.getSourceFileOrThrow(nestedEntry.filePath),
          ),
          filePath: nestedEntry.filePath,
          id: `${nestedEntry.filePath}:nested`,
          nameHint: fileStem(nestedEntry.filePath),
        },
        knownStatesByReferenceKey,
        knownStatesByFilePath,
        "nested-state",
        analyzedState.name,
      ),
    )

    return [analyzedState, ...nestedStates]
  })
  const graphStates = includeSpecialNodes(analyzedStates)
  const sortedStates = [...graphStates]

  sortedStates.sort((left, right) => {
    if (left.name === SPECIAL_HISTORY_NODE) {
      return 1
    }

    if (right.name === SPECIAL_HISTORY_NODE) {
      return -1
    }

    return left.name.localeCompare(right.name)
  })

  return {
    entryState: analyzedStates[0]?.name ?? "Unknown",
    name: candidate.name,
    sourceFilePath: candidate.sourceFilePath,
    stateIndexPath: candidate.stateIndexPath,
    states: sortedStates,
  }
}
