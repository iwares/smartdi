/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  // 让测试加载源码而非根目录的构建产物 index.js
  moduleNameMapper: {
    '^\\.\\./index\\.js$': '<rootDir>/index.ts',
  },
};