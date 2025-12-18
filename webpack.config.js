const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  // 由于我们使用纯HTML文件，不需要入口JavaScript文件
  entry: {},
  output: {
    path: path.join(__dirname, 'dist'),
    filename: 'bundle.js',
  },
  cache: false,
  resolve: {
    extensions: ['.js'],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
        },
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'public/Main.html'),
      filename: 'Main.html',
      cache: false,
      minify: false,
    }),
    new webpack.DefinePlugin({
      'global': 'global',
    }),
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'public'),
    },
    port: 8080,
    hot: true,
    historyApiFallback: {
      index: 'Main.html',
    },
  },
  target: 'electron-renderer',
  node: {
    global: true,
  },
};