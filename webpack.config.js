// We are using node's native package 'path'
// https://nodejs.org/api/path.html
const path = require('path');

const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

// Constant with our paths
const paths = {
  DIST: path.resolve(__dirname, 'game'),
  JS: path.resolve(__dirname, 'src'),
};

// Webpack configuration
module.exports = {
  entry: path.join(paths.JS, 'interaction/viewmodels.js'),
  output: {
    path: paths.DIST,
    filename: 'jump-n-bump.js',
  },
  // Tell webpack to use html plugin
  plugins: [
    new HtmlWebpackPlugin({
      minify: false,
      template: path.join(__dirname, 'src/jnb.html'),
    }),
    new MiniCssExtractPlugin({
      filename: 'style.bundle.css' // CSS will be extracted to this bundle file
    }), 
  ],
  // Loaders configuration
  // We are telling webpack to use "babel-loader" for .js and .jsx files
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: [
          'babel-loader',
        ],
      },
      // CSS loader for CSS files
      // Files will get handled by css loader and then passed to the extract text plugin
      // which will write it to the file we defined above
      {
        test: /\.css$/,
        loader: [
          MiniCssExtractPlugin.loader,
          'css-loader'
        ],
      },
      // File loader for image assets
      // We'll add only image extensions, but you can things like svgs, fonts and videos
      {
        test: /\.(png|jpg|gif)$/,
        use: [
          'file-loader',
        ],
      },
    ],
  },
  // Enable importing JS files without specifying their extension
  resolve: {
    extensions: ['.js'],
  },
  // Enable dev server for local development
  devServer: {
    contentBase: path.join(__dirname, 'game'),
    port: 9000
  },
};