export function highlightJson(json: string) {
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /(\/\/.*)$/gm,
      '<span style="color:#7A8698;font-style:italic">$1</span>',
    )
    .replace(
      /"([^"]+)":/g,
      '<span style="color:#8FC5E8">&quot;$1&quot;</span>:',
    )
    .replace(/: ("[^"]*")/g, ': <span style="color:#9FD8B4">$1</span>');
}
