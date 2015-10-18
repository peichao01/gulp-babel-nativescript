var path = require('path')
var Transform = require('readable-stream/transform');
var gutil = require('gulp-util');
var strip = require('strip-comment');

var babelEs5CommonUtilFunctionNames = [
	'_createClass', 
	'_get', 
	'_interopRequireDefault', 
	'_interopRequireWildcard',
	'_classCallCheck',
	'_inherits',
]

module.exports = function (tnsCoreModules, babelEs5CommonUtilFunctionsModulePath){
	if(babelEs5CommonUtilFunctionsModulePath && !babelEs5CommonUtilFunctionsModulePath.match(/\.js$/)){
		babelEs5CommonUtilFunctionsModulePath += '.js'
	}

	return new Transform({
		objectMode: true,
		transform: function(file, enc, callback){
			if (file.isNull()) {
				return callback(null, file);
			}

			if(file.isStream()){
				this.emit('error', new PluginError('gulp-babel-nativescript',  'Streaming not supported'));
				return callback(null, file)
			}

			if(file.isBuffer()){
				file.contents = new Buffer(doReplace(String(file.contents), file.path))
				return callback(null, file)
			}

			callback(null, file)
		}
	})

	function doReplace(contents, filePath){
		// 比较的时候，都有 ".js" 后缀
		var isBabelEs5Util = filePath === babelEs5CommonUtilFunctionsModulePath
		var originContentLines = strip.js(contents, true).split('\n')
		originContentLines = originContentLines.map(function (line, i) {
			return {
				content: line,
				index: i
			}
		})
		var contentLines = originContentLines.filter(function(line){ return line.content.trim() !== '' })

		var usedTnsCoreModules = extraceRequiredTnsCoreModules(contentLines)

		
		if(!isBabelEs5Util){
			doReplaceExtraBabelEs5ModuleImports(usedTnsCoreModules, contentLines)
		}

		var inheritClasses = extraceInheritClasses(usedTnsCoreModules, contentLines)
		inheritClasses.forEach(function (classInfo, i) {
			doReplaceClassContent(classInfo)

			classInfo.contents.forEach(function (line) {
				originContentLines[line.index] = line
			})
		})
		
		if(babelEs5CommonUtilFunctionsModulePath && !isBabelEs5Util){
			originContentLines = doReplaceBabelEs5CommonUtilFunctions(originContentLines, filePath, babelEs5CommonUtilFunctionsModulePath)
		}
		
		return originContentLines.map(function (line) {
			return line.content
		}).join('\n')
	}

	function isIndexTruth(index){
		return index >= 0
	}

	function extraceRequiredTnsCoreModules(contentLines){
		var usedTnsCoreModules = {}

		var requireStart
		contentLines.forEach(function (line, i) {
			var m
			/**
				babel 编译后的文件情况可能是这样的：
				
				// 这种情况，_dataObservable 在后面不会再使用，只会用到 observable
				import * as observable from "data/observable";
				↓↓↓↓↓↓↓↓
				var _dataObservable = require("data/observable");
				var observable = _interopRequireWildcard(_dataObservable);
				-----------------------------------------------------------------------------

				// 这种情况，只会有一个名字：_libDog
				import {walk, run} from 'lib/dog';
				↓↓↓↓↓↓↓↓
				var _libDog = require('lib/dog');
				-----------------------------------------------------------------------------

				// 这种情况，两个名字在后面都会用到，_libCat2 是专门用来导出 default 的
				import miao, {cute, color} from "lib/cat";
				↓↓↓↓↓↓↓↓
				var _libCat = require("lib/cat");
				var _libCat2 = _interopRequireDefault(_libCat);
			*/
			if(m = line.content.match(/var (.+?) = require\(('|")(.+?)\2\)/)){
				var requiredName = m[3]
				// require 的并不是 tns 核心模块
				if(!tnsCoreModules[requiredName]) return

				var usedModule = usedTnsCoreModules[requiredName] = usedTnsCoreModules[requiredName] || {
					requiredName: requiredName,
					variableNames: [],
					tmpVariableNames: []
				}
				usedModule.variableNames.push(m[1])

				requireStart = usedModule
			}
			else if(requireStart){
				if(m = line.content.match(new RegExp('var (.+?) = _interopRequire(Wildcard|Default)\\('+requireStart.variableNames[0]+'\\)'))){
					// 此时只会用到后面的变量名字
					if(m[2] == 'Wildcard'){
						requireStart.tmpVariableNames[0] = requireStart.variableNames[0]
						requireStart.variableNames[0] = m[1]
					}
					// 此时两个变量名字都会用到
					else if(m[2] == 'Default'){
						requireStart.variableNames.push(m[1])
					}
				}
				
				requireStart = null
			}
		})

		return usedTnsCoreModules
	}

	/**
	所有 require tns 核心模块的，都不能对其做 _interopRequireXX 的 增加 default 的处理
	因为 tns 核心模块的每一个属性有可能是跟 系统关联的，比如： application.mainModule
	但是 _interopRequireWildcard 却把整个 obj 所有属性替换到 newObj 上面了，蛋的
	**/
	function doReplaceExtraBabelEs5ModuleImports (usedTnsCoreModules, contentLines) {
		contentLines.forEach(function (line, i) {
			var reg = /(var (?:.+?) = )_interopRequire(?:Wildcard|Default)\(([^\()]+)\)/
			var m = line.content.match(reg)
			if(!m) return

			var _usedTnsCoreModules = values(usedTnsCoreModules)
			for(var i = 0, len = _usedTnsCoreModules.length; i<len; i++){
				var usedTnsCoreModule = _usedTnsCoreModules[i]
				
				if(usedTnsCoreModule.tmpVariableNames && m[2] == usedTnsCoreModule.tmpVariableNames[0]){
					// var _application = require('application');
					// 
					// var application = _interopRequireWildcard(_application);
					// ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
					// var application = _application;
					line.content = line.content.replace(reg, '$1$2')
					break
				}
			}
		})
	}

	function extraceInheritClasses (usedTnsCoreModules, contentLines) {
		var inheritStart = false
		var inheritClassPreWhitespace
		var classes = []
		var classInfo = initClass()

		// 所有使用了 _inherit 继承的 class
		contentLines.forEach(function(line, i){
			// 继承的 class
			if(line.content.match(/^\s*_inherits\((.+?), (.+?)\)/)){
				var inheritStartLine = contentLines[i-1]

				/**
				第一行，都长这个样子：

				var HelloWorldModel2 = (function (_observable$Observable) {
				*/
				var m = inheritStartLine.content.match(/^(\s*)var (.+) = \(function \((.+)\) {/)
				inheritClassPreWhitespace = m[1]
				inheritStart = true

				classInfo.className = m[2]
				classInfo.superInnerName = m[3]
				classInfo.contents.push(inheritStartLine)
				classInfo.contents.push(line)
			}
			else if(inheritStart){
				// 结束行
				/**
				最后一行，都长这个样子：

				})(observable.Observable);
				*/
				var m = line.content.match(/^(\s*)}\)\((.+)\)/)
				if(m && m[1] === inheritClassPreWhitespace){
					classInfo.contents.push(line)
					classInfo.superName = m[2]

					classes.push(classInfo)

					inheritStart = false
					classInfo = initClass()
				}
				// 中间行
				else{
					classInfo.contents.push(line)
				}
			}
		})

		// 过滤只继承了 tns 模块的 class，正常使用 babel 继承忽略
		classes = classes.filter(function (classInfo) {
			for(var key in usedTnsCoreModules){
				var tnsCoreModule = usedTnsCoreModules[key]

				for(var i = 0, len = tnsCoreModule.variableNames.length; i<len; i++){
					var variableName = tnsCoreModule.variableNames[i]
					// superName:    observable.Observable
					// variableName: observable
					if(classInfo.superName.indexOf(variableName + '.') >= 0 ||
						// superName:    observable['default']
						// variableName: observable
						classInfo.superName.indexOf(variableName + '[') >= 0){
						return true
					}
				}
			}
		})

		return classes

		function initClass(){
			return {
				className: null,
				superName: null,
				superInnerName: null,
				contents: []
			}
		}
	}

	// 将 babel-es5 的方式，改为 nativescript 的方式（比如各自 有自己的继承系统）
	function doReplaceClassContent(classInfo){
		// _inherits(ClassName, _observable$Observable); 
		// ↓↓↓↓↓↓↓↓↓↓↓↓↓
		// __extends(ClassName, _super);
		classInfo.contents[1].content = classInfo.contents[1].content.replace(/^(\s*).+$/, 
			'$1__extends('+classInfo.className+', '+classInfo.superInnerName+');')

		classInfo.contents = classInfo.contents.map(function(line, i){
			// babel:        no constructor
			// ↓↓↓↓↓↓↓↓↓↓↓↓↓
			// babel es5:    _get(Object.getPrototypeOf(ClassName.prototype), "constructor", this).apply(this, arguments);
			// ↓↓↓↓↓↓↓↓↓↓↓↓↓
			// nativescript: ClassName.prototype.constructor.apply(this, arguments);

			// babel:        super.a(...args)
			// ↓↓↓↓↓↓↓↓↓↓↓↓↓
			// babel es5:    _get(Object.getPrototypeOf(ClassName.prototype), "a", this).apply(this, args);
			// ↓↓↓↓↓↓↓↓↓↓↓↓↓
			// nativescript: ClassName.prototype.a.apply(this, args);

			// babel:        super.b.apply(this,arguments)
			// ↓↓↓↓↓↓↓↓↓↓↓↓↓
			// babel es5:    _get(Object.getPrototypeOf(ClassName.prototype), "b", this).apply(this, arguments);
			// ↓↓↓↓↓↓↓↓↓↓↓↓↓
			// nativescript: ClassName.prototype.b.apply(this, arguments);

			// babel:        static: super.a()
			// ↓↓↓↓↓↓↓↓↓↓↓↓↓
			// babel es5:    _get(Object.getPrototypeOf(ClassName), "a", this).call(this);
			// ↓↓↓↓↓↓↓↓↓↓↓↓↓
			// nativescript: ClassName.a.call(ClassName);

			// babel:        super.tag()
			// ↓↓↓↓↓↓↓↓↓↓↓↓↓
			// babel es5:    _get(Object.getPrototypeOf(ClassName.prototype), "tag", this).call(this);
			// ↓↓↓↓↓↓↓↓↓↓↓↓↓
			// nativescript: ClassName.prototype.tag.call(this);
			var m = line.content.match(/^(\s*)_get\(Object\.getPrototypeOf\(([^\)]+?)(\.prototype)?\), "([^"]+)", this\)\.(call|apply)\(([^\)]+)\)/)
			if(m){
				var pre_whitespace = m[1]
				var _constructor = classInfo.superInnerName
				var is_prototype = !!m[3]
				var method_name = m[4]
				var call_or_apply = m[5]
				var method_arguments = m[6]
				var constructor_or_prototype = _constructor + (m[3] || '')

				// static 方法，就要把 call、apply 的 context 设置为 class 本身
				if(!is_prototype){
					method_arguments = method_arguments.replace(/^this/, classInfo.className)
				}

				// constructor 直接调构造函数，不要再找 prototype.constructor 了
				if(method_name === 'constructor'){
					line.content = pre_whitespace + _constructor+'.'+call_or_apply+'('+method_arguments+');'
				}
				else{
					line.content = pre_whitespace + constructor_or_prototype+'.'+method_name+'.'+call_or_apply+'('+method_arguments+');'
				}
			}
			return line
		})
	}

	function doReplaceBabelEs5CommonUtilFunctions(originContentLines, currentModulePath, babelEs5CommonUtilFunctionsModulePath){

		// 去掉 ".js" 后缀
		babelEs5CommonUtilFunctionsModulePath = babelEs5CommonUtilFunctionsModulePath.match(/^(.+?)(?:\.js)?$/)[1]

		var usedBabelEs5CommonUtilFunctionNames = false
		var requiredBabelEs5CommonUtilFunctionModuleName = '_babelEs5CommonUtil'
		originContentLines = originContentLines.map(function (line, i) {
			for(var i = 0, len = babelEs5CommonUtilFunctionNames.length; i<len; i++){
				var babelEs5CommonUtilFunctionName = babelEs5CommonUtilFunctionNames[i]
				var lineContent = line.content.trim()
				var regBabelEs5CommonUtilFunctionUsage

				// 对 babelEs5CommonUtilFunction 的定义，直接移除
				if(lineContent.indexOf('var ' + babelEs5CommonUtilFunctionName + ' = ') >= 0 ||
					lineContent.indexOf('function ' + babelEs5CommonUtilFunctionName + '(') >= 0)
				{
					usedBabelEs5CommonUtilFunctionNames = true
					line.content = ''
					break
				}
				// 对 babelEs5CommonUtilFunction 的使用，添加模块前缀
				else if(regBabelEs5CommonUtilFunctionUsage = new RegExp('\\b'+babelEs5CommonUtilFunctionName+'\\('),
					line.content.match(regBabelEs5CommonUtilFunctionUsage))
				{
					line.content = line.content.replace(regBabelEs5CommonUtilFunctionUsage, requiredBabelEs5CommonUtilFunctionModuleName+'.'+babelEs5CommonUtilFunctionName+'(')
					break
				}
			}
			return line
		})
		if(usedBabelEs5CommonUtilFunctionNames){
			var babelEs5CommonUtilFunctionsModuleRelativePath = path.relative(path.dirname(currentModulePath), babelEs5CommonUtilFunctionsModulePath)
			if(babelEs5CommonUtilFunctionsModuleRelativePath.substr(0, 1) !== '.') 
				babelEs5CommonUtilFunctionsModuleRelativePath = './' + babelEs5CommonUtilFunctionsModuleRelativePath

			// 第一行是： "use strict";
			// 把 这个 require 放在 第二行
			originContentLines.splice(1, 0, {
				content: 'var '+requiredBabelEs5CommonUtilFunctionModuleName+' = require("'+babelEs5CommonUtilFunctionsModuleRelativePath+'");'
			})
		}
		return originContentLines
	}
}

function values(obj){
	return Object.keys(obj).map(function (key) {
		return obj[key]
	})
}