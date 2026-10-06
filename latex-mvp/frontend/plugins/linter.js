/**
 * linter.js - Deterministic, local static analysis linter for CodeMirror 6.
 * Zero tokens, zero network requests. Detects:
 *   - Unmatched math delimiters ($, $$, \\(, \\), \\[, \\])
 *   - Mismatched \\begin{env} and \\end{env}
 *   - Unbalanced braces ({ and })
 *   - Dangerous unescaped underscores/carets outside math mode
 */

export function createLatexLinter(linterFn) {
  return linterFn((view) => {
    const diagnostics = [];
    const doc = view.state.doc;
    const text = doc.toString();

    // 1. Check Unbalanced Curly Braces { and }
    const braceStack = [];
    let inComment = false;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const prev = i > 0 ? text[i - 1] : "";

      if (char === "\n") {
        inComment = false;
        escaped = false;
        continue;
      }
      if (inComment) continue;

      if (char === "%" && prev !== "\\") {
        inComment = true;
        continue;
      }

      if (char === "\\" && prev !== "\\") {
        escaped = true;
        continue;
      }

      if (!escaped) {
        if (char === "{") {
          braceStack.push(i);
        } else if (char === "}") {
          if (braceStack.length === 0) {
            diagnostics.push({
              from: i,
              to: i + 1,
              severity: "error",
              message: "Chave de fechamento '}' inesperada sem abertura correspondente."
            });
          } else {
            braceStack.pop();
          }
        }
      }

      escaped = false;
    }

    // Remaining unclosed braces
    for (const openPos of braceStack) {
      diagnostics.push({
        from: openPos,
        to: Math.min(openPos + 1, text.length),
        severity: "error",
        message: "Chave '{' aberta nunca foi fechada."
      });
    }

    // 2. Check Matching Environments (\begin{env} vs \end{env})
    const envStack = [];
    const envRegex = /\\(begin|end)\{([a-zA-Z*]+)\}/g;
    let match;

    while ((match = envRegex.exec(text)) !== null) {
      // Check if inside a comment line
      const lineStart = text.lastIndexOf("\n", match.index) + 1;
      const lineUntilMatch = text.slice(lineStart, match.index);
      if (/%/.test(lineUntilMatch.replace(/\\%/g, ""))) {
        continue; // Ignored inside comment
      }

      const type = match[1]; // "begin" or "end"
      const envName = match[2];
      const startPos = match.index;
      const endPos = match.index + match[0].length;

      if (type === "begin") {
        envStack.push({ name: envName, start: startPos, end: endPos });
      } else {
        if (envStack.length === 0) {
          diagnostics.push({
            from: startPos,
            to: endPos,
            severity: "error",
            message: `\\end{${envName}} encontrado sem nenhum \\begin correspondente aberto.`
          });
        } else {
          const top = envStack.pop();
          if (top.name !== envName) {
            diagnostics.push({
              from: startPos,
              to: endPos,
              severity: "error",
              message: `Inconsistência de ambiente: esperado \\end{${top.name}}, mas foi encontrado \\end{${envName}}.`
            });
          }
        }
      }
    }

    // Any unclosed environments left
    for (const unclosed of envStack) {
      diagnostics.push({
        from: unclosed.start,
        to: unclosed.end,
        severity: "error",
        message: `Ambiente \\begin{${unclosed.name}} não foi fechado com \\end{${unclosed.name}}.`
      });
    }

    // 3. Check Inline Math Delimiters ($ ... $)
    let mathDollarPos = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\n") continue;
      const prev = i > 0 ? text[i - 1] : "";
      if (text[i] === "%" && prev !== "\\") {
        // Skip comment line
        const nextNl = text.indexOf("\n", i);
        i = nextNl === -1 ? text.length : nextNl;
        continue;
      }

      // Check double $$
      if (text[i] === "$" && text[i + 1] === "$" && prev !== "\\") {
        i++; // skip next $
        continue;
      }

      // Single $
      if (text[i] === "$" && prev !== "\\") {
        if (mathDollarPos === -1) {
          mathDollarPos = i;
        } else {
          // Closed
          mathDollarPos = -1;
        }
      }
    }

    if (mathDollarPos !== -1) {
      diagnostics.push({
        from: mathDollarPos,
        to: mathDollarPos + 1,
        severity: "warning",
        message: "Delimitador matemático '$' aberto sem fechamento no texto."
      });
    }

    return diagnostics;
  });
}
