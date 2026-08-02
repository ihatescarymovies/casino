const { withExpo } = require("@expo/metro-config");

const config = withExpo({
  projectRoot: __dirname,
});

// Enable workspace imports — Metro needs to resolve packages outside node_modules
config.resolver.nodeModulesPaths = [
  require("path").resolve(__dirname, "node_modules"),
  require("path").resolve(__dirname, "../../node_modules"),
];

config.resolver.disableHierarchicalLookup = false;

module.exports = config;
