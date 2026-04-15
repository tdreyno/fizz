import { basename, dirname, extname, resolve } from "node:path"

import type {
  CallExpression,
  Expression,
  Identifier,
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
    .map(part => `${part[0].toUpperCase()}${part.slice(1)}`)
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

          return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")
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
    `${basePath}.ts`,
    `${basePath}.tsx`,
    basePath.replace(/\.js$/, ".ts"),
    basePath.replace(/\.js$/, ".tsx"),
    resolve(basePath, "index.ts"),
    resolve(basePath, "index.tsx"),
  ]

  return candidates.find(candidate =>
    sourceFile.getProject().getSourceFile(candidate),
  )
}

const getDefaultExportExpression = (
  sourceFile: SourceFile,
): Expression | undefined => {
  const exportAssignment = sourceFile
    .getExportAssignments()
    .find(assignment => !assignment.isExportEquals())

  return exportAssignment?.getExpression()
}

const getCreateMachineCallFromExpression = (
  expression: Expression,
): CallExpression | undefined => {
  if (Node.isCallExpression(expression)) {
    return getCallIdentifierName(expression) === "createMachine"
      ? expression
      : undefined
  }

  if (!Node.isIdentifier(expression)) {
    return undefined
  }

  const declarationNode = expression
    .getDefinitions()
    .map(definition => definition.getDeclarationNode())
    .find(declaration => declaration && Node.isVariableDeclaration(declaration))

  if (!declarationNode || !Node.isVariableDeclaration(declarationNode)) {
    return undefined
  }

  const initializer = declarationNode.getInitializer()

  return initializer && Node.isCallExpression(initializer)
    ? getCreateMachineCallFromExpression(initializer)
    : undefined
}

const getDefaultCreateMachineCall = (
  sourceFile: SourceFile,
): CallExpression | undefined => {
  const expression = getDefaultExportExpression(sourceFile)

  return expression ? getCreateMachineCallFromExpression(expression) : undefined
}

const getMachineDefinitionObject = (
  sourceFile: SourceFile,
): Expression | undefined => {
  const callExpression = getDefaultCreateMachineCall(sourceFile)
  const [firstArgument] = callExpression?.getArguments() ?? []

  return firstArgument && Node.isObjectLiteralExpression(firstArgument)
    ? firstArgument
    : undefined
}

const getMachineDefinitionIdentifier = (
  sourceFile: SourceFile,
  propertyName: string,
): Identifier | undefined => {
  const definitionObject = getMachineDefinitionObject(sourceFile)

  if (!definitionObject || !Node.isObjectLiteralExpression(definitionObject)) {
    return undefined
  }

  const property = definitionObject.getProperty(propertyName)

  if (!property) {
    return undefined
  }

  return getNamedObjectPropertyIdentifier(property)
}

const getMachineStateIndexPath = (
  sourceFile: SourceFile,
): string | undefined => {
  const statesIdentifier = getMachineDefinitionIdentifier(sourceFile, "states")

  return statesIdentifier
    ? getSourceFilePathForIdentifier(statesIdentifier)
    : undefined
}

const getMachineName = (sourceFile: SourceFile): string => {
  const callExpression = getDefaultCreateMachineCall(sourceFile)
  const [, nameArgument] = callExpression?.getArguments() ?? []

  const explicitName = getStringLiteralValue(nameArgument)

  if (explicitName) {
    return explicitName
  }

  const definitionObject = getMachineDefinitionObject(sourceFile)

  if (!definitionObject || !Node.isObjectLiteralExpression(definitionObject)) {
    return createCandidateName(sourceFile.getFilePath())
  }

  const nameProperty = definitionObject.getProperty("name")

  if (!nameProperty || !Node.isPropertyAssignment(nameProperty)) {
    return createCandidateName(sourceFile.getFilePath())
  }

  return (
    getStringLiteralValue(nameProperty.getInitializer()) ??
    createCandidateName(sourceFile.getFilePath())
  )
}

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
  const callExpression = getDefaultStateCall(sourceFile)

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

const extractStateEntriesFromStateIndex = (
  sourceFile: SourceFile,
): Array<{ filePath: string }> => {
  const expression = getDefaultExportExpression(sourceFile)

  if (Node.isObjectLiteralExpression(expression)) {
    return expression.getProperties().flatMap(property => {
      const identifier = getNamedObjectPropertyIdentifier(property)

      if (!identifier) {
        return []
      }

      const definitionFilePath = getSourceFilePathForIdentifier(identifier)

      return definitionFilePath ? [{ filePath: definitionFilePath }] : []
    })
  }

  const namedExportEntries = sourceFile
    .getExportDeclarations()
    .flatMap(exportDeclaration =>
      exportDeclaration.getNamedExports().flatMap(exportSpecifier => {
        const identifier =
          exportSpecifier.getAliasNode() ?? exportSpecifier.getNameNode()
        const definitionFilePath = getSourceFilePathForIdentifier(identifier)

        return definitionFilePath ? [{ filePath: definitionFilePath }] : []
      }),
    )

  return Array.from(
    new Map(namedExportEntries.map(entry => [entry.filePath, entry])).values(),
  )
}

const getStringLiteralValue = (
  expression: Expression | undefined,
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

    const stateFilePath = getSourceFilePathForIdentifier(expressionNode)
    const targetStateName = stateFilePath
      ? knownStatesByFilePath.get(stateFilePath)
      : undefined

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
      const result = analyzeExpression(
        body,
        currentStateName,
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

const getDefaultStateCall = (
  sourceFile: SourceFile,
): CallExpression | undefined => {
  const expression = getDefaultExportExpression(sourceFile)

  return expression && Node.isCallExpression(expression)
    ? expression
    : undefined
}

const getPreliminaryStateName = (
  project: Project,
  stateFilePath: string,
): string => {
  const sourceFile = project.getSourceFileOrThrow(stateFilePath)
  const callExpression = getDefaultStateCall(sourceFile)

  if (!callExpression) {
    return createCandidateName(stateFilePath)
  }

  return getExplicitStateName(
    callExpression,
    toPascalCase(fileStem(stateFilePath)),
  )
}

const analyzeStateFile = (
  context: GraphBuilderContext,
  stateFilePath: string,
  knownStatesByFilePath: Map<string, string>,
  kind: MachineState["kind"] = "state",
  nestedParentState?: string,
): StateAnalysis => {
  const cachedState = context.stateCache.get(stateFilePath)

  if (cachedState) {
    return cachedState
  }

  const sourceFile = context.project.getSourceFileOrThrow(stateFilePath)
  const callExpression = getDefaultStateCall(sourceFile)

  if (!callExpression) {
    const fallbackState: MachineState = {
      filePath: stateFilePath,
      kind,
      name: createCandidateName(stateFilePath),
      nestedParentState,
      notes: [],
      outputs: [],
      transitions: [],
    }

    context.stateCache.set(stateFilePath, fallbackState)
    return fallbackState
  }

  const fallbackName = toPascalCase(fileStem(stateFilePath))
  const name = getExplicitStateName(callExpression, fallbackName)
  const expression = callExpression.getExpression()
  const stateKind =
    Node.isIdentifier(expression) && expression.getText() === "stateWithNested"
      ? "nested-parent"
      : kind
  const analysis: MachineState = {
    filePath: stateFilePath,
    kind: stateKind,
    name,
    nestedParentState,
    notes: [],
    outputs: [],
    transitions: [],
  }

  context.stateCache.set(stateFilePath, analysis)
  knownStatesByFilePath.set(stateFilePath, name)

  const [handlersArgument, nestedInitialArgument] =
    callExpression.getArguments()
  const handlers =
    handlersArgument && Node.isObjectLiteralExpression(handlersArgument)
      ? handlersArgument.getProperties()
      : []
  const notes = new Set<string>()
  const outputs = new Set<string>()

  handlers.forEach(property => {
    const handler = analyzeHandler(property, name, knownStatesByFilePath)

    handler.targets.forEach(target => {
      analysis.transitions.push({
        action: handler.action,
        kind: target === name ? "self" : "normal",
        target,
      })
    })

    handler.specialTargets.forEach(target => {
      analysis.transitions.push({
        action: handler.action,
        kind: "special",
        note: target === SPECIAL_HISTORY_NODE ? "history back" : undefined,
        target,
      })
    })

    handler.outputs.forEach(output => outputs.add(output))
    handler.notes.forEach(note => notes.add(`${handler.action}: ${note}`))
  })

  if (
    stateKind === "nested-parent" &&
    nestedInitialArgument &&
    Node.isCallExpression(nestedInitialArgument)
  ) {
    const nestedInitialIdentifier = nestedInitialArgument.getExpression()

    if (Node.isIdentifier(nestedInitialIdentifier)) {
      const nestedStateFilePath = getSourceFilePathForIdentifier(
        nestedInitialIdentifier,
      )

      if (nestedStateFilePath) {
        const nestedState = analyzeStateFile(
          context,
          nestedStateFilePath,
          knownStatesByFilePath,
          "nested-state",
          name,
        )
        analysis.nestedInitialState = nestedState.name
        notes.add(`nested initial state: ${nestedState.name}`)
      }
    }
  }

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
          nestedParentState: undefined,
          nestedInitialState: undefined,
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
      const stateIndexPath = getMachineStateIndexPath(sourceFile)

      if (!stateIndexPath || !sourceFile.getFilePath().startsWith(rootDir)) {
        return
      }

      const candidate: MachineCandidate = {
        name: getMachineName(sourceFile),
        sourceFilePath: sourceFile.getFilePath(),
        stateIndexPath,
      }

      candidateMap.set(candidate.sourceFilePath, candidate)
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
  const stateIndexFile = project.getSourceFileOrThrow(candidate.stateIndexPath)
  const stateEntries = extractStateEntriesFromStateIndex(stateIndexFile)
  const knownStatesByFilePath = new Map<string, string>(
    stateEntries.map(entry => [
      entry.filePath,
      getPreliminaryStateName(project, entry.filePath),
    ]),
  )

  stateEntries.forEach(entry => {
    getNestedStateEntriesForStateFile(project, entry.filePath).forEach(
      nestedEntry => {
        knownStatesByFilePath.set(
          nestedEntry.filePath,
          getPreliminaryStateName(project, nestedEntry.filePath),
        )
      },
    )
  })

  const analyzedStates = stateEntries.flatMap(entry => {
    const analyzedState = analyzeStateFile(
      context,
      entry.filePath,
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
        nestedEntry.filePath,
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
