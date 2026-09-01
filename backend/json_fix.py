"""
Fix malformed JSON from Gemini that contains unescaped LaTeX backslashes.

Gemini often returns JSON like:
  {"answer": "\frac{1}{2} + \sqrt{x}"}
where \f is form-feed and \s is invalid.

This module doubles those backslashes so json.loads can parse the string.
"""

import re

# Valid JSON escape characters that can follow a backslash in a string
_VALID_JSON_AFTER_BACKSLASH = set('"\\/bfnrtu')


def fix_json_backslashes(raw: str) -> str:
    """
    Fix unescaped backslashes in JSON text from Gemini.

    Scans character-by-character inside double-quoted strings.
    When a backslash is NOT part of a valid JSON escape, it gets doubled.

    For ambiguous cases like \\f (could be form-feed or \\frac),
    checks if followed by a letter — if so, it's LaTeX, not JSON.
    """
    result = []
    i = 0
    n = len(raw)

    while i < n:
        ch = raw[i]

        if ch == '"':
            # Start of a JSON string value
            result.append(ch)
            i += 1

            # Process until closing quote
            while i < n:
                c = raw[i]

                if c == '\\' and (i + 1) < n:
                    nxt = raw[i + 1]

                    if nxt in _VALID_JSON_AFTER_BACKSLASH:
                        if nxt == 'u' and (i + 5) >= n:
                            # Incomplete \\u escape at end
                            result.append('\\')
                            result.append(nxt)
                            i += 2
                        elif nxt in 'bfnrt':
                            # Could be JSON escape or LaTeX command
                            after_pos = i + 2
                            if after_pos < n and raw[after_pos].isalpha():
                                # LaTeX: \frac, \sin, \tan, \rho, \name, etc.
                                # Double the backslash
                                result.append('\\')
                                result.append('\\')
                                result.append(nxt)
                                i += 2
                            else:
                                # Real JSON escape: \n, \t, \f, etc.
                                result.append(c)
                                result.append(nxt)
                                i += 2
                        else:
                            # Valid JSON: \", \\, \/, \uXXXX
                            result.append(c)
                            result.append(nxt)
                            i += 2
                            if nxt == 'u':
                                # Skip the 4 hex digits
                                hex_end = min(i + 4, n)
                                result.append(raw[i:hex_end])
                                i = hex_end
                    else:
                        # Invalid JSON escape: \s, \p, \l, \d, \a, etc.
                        # Double the backslash
                        result.append('\\')
                        result.append('\\')
                        result.append(nxt)
                        i += 2

                elif c == '"' and (i == 0 or raw[i - 1] != '\\'):
                    # End of string
                    result.append(c)
                    i += 1
                    break

                else:
                    result.append(c)
                    i += 1
        else:
            result.append(ch)
            i += 1

    return ''.join(result)
