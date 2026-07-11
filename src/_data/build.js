const d = new Date();
const z = (n) => String(n).padStart(2, "0");
export default {
  date: `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`,
};
