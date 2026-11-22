// iOS 18 materials are plain CSS (a blurred translucent layer with a hairline, see css/style.css):
// there is nothing to compute any more. liquid() stays so that callers do not change; it does nothing.
export function liquid() {
  return { set() {} };
}
