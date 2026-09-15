/** Tailwind preset for InspectAI apps. Consumes the authoritative token values. */
const { colors, radii, shadows, typography } = require("./dist/tokens.js");

module.exports = {
  content: [],
  theme: {
    extend: {
      colors,
      borderRadius: radii,
      boxShadow: shadows,
      fontFamily: typography.fontFamily,
    },
  },
};
