import { useEffect } from "react";

const FORM_CONTROL_SELECTOR =
  'input:not([type="hidden"]), textarea, select, [contenteditable="true"]';
const ROOT_CLASS = "form-input-focused";

function isFormControl(element: Element | null): boolean {
  return (
    element instanceof HTMLElement &&
    element.matches(FORM_CONTROL_SELECTOR)
  );
}

function syncFormFocusClass(): void {
  if (isFormControl(document.activeElement)) {
    document.documentElement.classList.add(ROOT_CLASS);
  } else {
    document.documentElement.classList.remove(ROOT_CLASS);
  }
}

/** Ref-counted document listener — safe when multiple AnimatedBackground instances mount. */
let mountCount = 0;

function onFocusChange(): void {
  // focusout fires before the next focusin; defer so activeElement is updated
  queueMicrotask(syncFormFocusClass);
}

export function useFormInputFocus(): void {
  useEffect(() => {
    if (mountCount === 0) {
      document.addEventListener("focusin", onFocusChange);
      document.addEventListener("focusout", onFocusChange);
    }
    mountCount += 1;

    return () => {
      mountCount -= 1;
      if (mountCount === 0) {
        document.removeEventListener("focusin", onFocusChange);
        document.removeEventListener("focusout", onFocusChange);
        document.documentElement.classList.remove(ROOT_CLASS);
      }
    };
  }, []);
}
