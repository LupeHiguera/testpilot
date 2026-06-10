/** Whole-file diff for a proposed repair: the original content as `-` lines, the
 *  proposed content as `+` lines. Coarse but unambiguous — it is rendered for
 *  human review (PR body, dashboard), not consumed by `patch`. */
export function createPatch(filePath: string, before: string, after: string): string {
  return [
    `--- ${filePath}`,
    `+++ ${filePath} (repaired)`,
    '@@',
    ...before.split('\n').map((line) => `-${line}`),
    ...after.split('\n').map((line) => `+${line}`)
  ].join('\n');
}
