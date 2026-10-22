/** Layout size fills the parent. Painted size is what an ancestor scale actually shows. */
export function paintedBox(parent: HTMLElement) {
  const layoutW = Math.max(1, parent.clientWidth);
  const layoutH = Math.max(1, parent.clientHeight);
  const rect = parent.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width >= 2 ? rect.width : layoutW));
  const height = Math.max(1, Math.floor(rect.height >= 2 ? rect.height : layoutH));
  return { layoutW, layoutH, width, height };
}
