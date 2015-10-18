var path = require('path')
var walk = require('walk')
var fs = require('fs-extra')
var async = require('async')

var node_modules_dir = path.join(__dirname, '../node_modules')
var tns_modules_dir = path.join(node_modules_dir, 'tns-core-modules')
var tns_modules_list_json = path.join(__dirname, 'tns-core-modules.json')

var tnsCoreModules = {}
var tnsCoreModulesPackage = {}

function getTnsCoreModules(callback, reload){
	if(Object.keys(tnsCoreModules).length){
		callback(null, tnsCoreModules)
	}
	else{
		fs.access(tns_modules_list_json, fs.F_OK, function (err) {
			var exists = !err
			onTnsModulesJsonAccess(exists)
		})
	}

	function onTnsModulesJsonAccess(exists){
		if(reload || !exists){

			var walker = walk.walk(tns_modules_dir)
			walker.on('file', function (root, fileStats, next) {
				var moduleKey = path.join(root, fileStats.name)
				var packageKey = path.join(root, 'package.json')

				if(moduleKey.match(/\.js$/)){
					tnsCoreModulesPackage[packageKey] = tnsCoreModulesPackage[packageKey] || []
					tnsCoreModulesPackage[packageKey].push(moduleKey)
				}
				
				next()
			})
			walker.on('errors', function (root, nodeStatsArray, next) {
				console.error('[ERROR] [WALKER] => ', nodeStatsArray)
				next()
			})
			walker.on('end', onWalkAllModules)
		}
		else{
			fs.readJson(tns_modules_list_json, function (err, tnsCoreModules) {
				if(err) 
					console.error('[ERROR] [TNS MODULES JSON] => ', err)

				callback && callback(err, tnsCoreModules)
			})
		}
	}

	function onWalkAllModules(){
		async.each(Object.keys(tnsCoreModulesPackage), onEachModulePackage, onEachModulePackageEnd)

		function onEachModulePackage (packageKey, next) {
			fs.access(packageKey, fs.F_OK, function (err) {
				// 模块没有 package.json， 如： ui/core 模块
				if(err){
					onPackageKeyAccess(packageKey, null)
					return next()
				}

				fs.readFile(packageKey, 'utf8', function (err, content) {
					// 这些 JSON 都有问题，第一个字符（我也不知道这称为什么字符），是一个非可视特殊符号
					var json = JSON.parse(content.replace(/\s/g, ''))
					if(err) {
						console.error('[ERROR] [ASYNC EACH] => ', err)
						return next(err)
					}

					onPackageKeyAccess(packageKey, json)
					return next()
				})
			})
		}

		function onPackageKeyAccess(packageKey, packageJson){
			var modules = tnsCoreModulesPackage[packageKey]

			modules.forEach(function (moduleKey, i) {
				// 'data/observebale.ios.js' ==>> ["data/observebale.ios.js", "data/observebale", "ios"]
				if(m = moduleKey.match(/^(.+?)(?:\.(ios|android))?\.js$/)){
					moduleKey = m[1]
					tnsCoreModules[getModuleKey(moduleKey)] = true
				}
			})

			if(packageJson && packageJson.main){
				var moduleDir = path.dirname(packageKey)
				// packageJson.main 的值都是相对于 package.json 本身的文件夹
				// 如："main": "content-view.js"
				// 所以要改为全路径：/path/to/modules/content-view.js
				packageJson.main = path.join(moduleDir, packageJson.main)
				// /path/to/modules/content-view.js ==>> modules/content-view
				packageJson.main = getModuleKey(packageJson.main.match(/^(.+?)(?:\.js)?$/)[1])
				// 如果有这个 main 模块，则可以直接引用到文件接的级别（即为 main 模块）
				if(tnsCoreModules[packageJson.main]){
					tnsCoreModules[getModuleKey(moduleDir)] = true
				}
			}
		}

		function onEachModulePackageEnd (err) {
			if(err) return console.error('[ERROR] [ASYNC EACH END] => ', err)

			fs.outputFile(tns_modules_list_json, JSON.stringify(tnsCoreModules, null, 4), function (err) {
				if(err) return console.error('[ERROR] [OUTPU JSON] => ', err)

				callback && callback(err, tnsCoreModules)
			})
		}
	}
}

function getModuleKey(moduleFullPathname){
	return path.relative(tns_modules_dir, moduleFullPathname)
}

// getTnsCoreModules()

module.exports = getTnsCoreModules