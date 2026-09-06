// Progress values come only from the runtime. A completed substage does not
// mean the whole load is done: keep waiting visibly until the real ready event.
export function loadingLine(element, active, value) {
 element.hidden = !active;
 const determinate = active && Number.isFinite(value) && value >= 0 && value <= 1;
 element.dataset.determinate = String(determinate);
 if (determinate) {
  element.setAttribute('aria-valuenow', String(value));
  element.style.setProperty('--progress', `${value * 100}%`);
 } else {
  element.removeAttribute('aria-valuenow');
  element.style.removeProperty('--progress');
 }
}
