---
"@tdreyno/fizz": minor
---

DOM effect builders now take `resourceId` as the trailing optional argument.

`dom.getElementById`, `dom.querySelector`, `dom.querySelectorAll`,
`dom.getElementsByClassName`, `dom.getElementsByName`,
`dom.getElementsByTagName`, `dom.closest`, `dom.fromElement`, and their
`dom.from(scope).*` scoped equivalents now accept the primary query argument
first and a trailing optional `resourceId`. When `resourceId` is omitted, Fizz
generates a stable id automatically for internal bookkeeping. Pass an explicit
id when you need to reference the resource by name (for example from
`dom.listen("my-id", ...)`).

Migration:

| Before                                   | After                                    |
| ---------------------------------------- | ---------------------------------------- |
| `dom.getElementById("btn", "submit")`    | `dom.getElementById("submit", "btn")`    |
| `dom.querySelector("form", ".checkout")` | `dom.querySelector(".checkout", "form")` |
| `dom.fromElement("node", element)`       | `dom.fromElement(element, "node")`       |
| `dom.from("scope").closest("x", ".sel")` | `dom.from("scope").closest(".sel", "x")` |

For one-off queries that do not need a stable name, omit the id entirely:
`dom.querySelector(".item")`.
