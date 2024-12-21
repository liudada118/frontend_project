const fs = require('fs');
const path = require('path');

// babylon 将代码转化为ast语法树
// ast 将js代码转化为 一种json结构
const babylon = require('babylon');

// babel-traverse是一个对ast 进行遍历的工具，对ast进行转换
const traverse = require('babel-traverse');

const { transformFromAst } = require('babel-core');

// 每一个js文件有一个id
let ID = 0;

function createAsset(filename) {
  const content = fs.readFileSync(filename, 'utf8');

  // 将该文件转化为ast
  const ast = babylon.parse(content, {
    sourceType: 'module',
  });

  // dependencies 保存所依赖的模块的相对路径
  const dependencies = [];

  // 寻找import节点，找到该文件依赖关系
  traverse(ast, {
    ImportDeclaration: ({ node }) => {
      dependencies.push(node.source.value);
    },
  });

  const id = ID++;

  const { code } = transformFromAst(ast, null, {
    presets: ['env'],
  });

  return {
    id,
    filename,
    dependencies,
    code,
  };
}

function createGraph(entry) {
  const mainEntry = createAsset(entry);
  const queue = [mainEntry];

  for (let asset of queue) {
    asset.mapping = {};

    // 获取本模块的路径
    const dirname = path.dirname(asset.filename);

    asset.dependencies.forEach((relativePath) => {
      const absolutePath = path.join(dirname, relativePath);

      const child = createAsset(absolutePath);

      asset.mapping[relativePath] = child.id;

      queue.push(child);
    });
  }

//  最终依赖图
  return queue;
}

// 自定义实现require方法，找出导出变量的引用逻辑
function bundle(graph){
    let modules = '';
    graph.forEach((mod) => {
        modules += `${mod.id}:[
            function(require , module , exports) {${mod.code}},
            ${JSON.stringify(mod.mapping)}
        ]`;
    });
    const result = `
        (function(modules){
            function require(id){
                const [fn , mapping] = modules[id];
                function localRequire(name){
                    return require(mapping[name]);
                }
                const module = {exports : {}};
                fn(localRequire , module , module.exports);
                return modules.exports;
            }
            require(0);
        })(${modules})
    `;
    return result;
}

const graph = createGraph()
