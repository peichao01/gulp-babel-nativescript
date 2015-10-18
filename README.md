# gulp-babel-nativescript
replace gulp-babel compiled es5 content to match nativescript(now is v1.4.2)'s rule

Usage:
----------------------------------------
```javascript
// babelNativescript signature: 
//
// babelNativescript(tnsCoreModules: {${moduleName}: true}, babelEs5CommonUtilFunctionsModulePath: string)
//
// About tnsCoreModules, see ./script/tns-core-modules.json for more infomation
var babelNativescript = require('gulp-babel-nativescript')
var getTnsCoreModules = require('./script/tns-core-modules')

gulp.task('es6', function(){
  getTnsCoreModules(function(err, tnsCoreModules){
		gulp.src('./app-src/**/*.js')
			.pipe(babel())
			.pipe(babelNativescript(tnsCoreModules, path.join(__dirname, 'app-src/utils/babel-es5-common-helpers')))
			.pipe(gulp.dest('./app'))	
	})
})
```

Notice:
----------------------------------------
1. the name of the required tns-core-modules can not be renamed to another variable name after required. because the require of tns-core-module is find by RexExp string match.

Example:
----------------------------------------

```javascript
// es6
import * as observable from "data/observable";

export class HelloWorldModel extends observable.Observable{
    constructor () {
        super()
        this.counter = 42
        this.set("message", this.counter + " taps left");
    }
    tapAction () {
        this.counter--;
        if (this.counter <= 0) {
            this.set("message", "Hoorraaay! You unlocked the NativeScript clicker achievement!");
        }
        else {
            this.set("message", this.counter + " taps left");
        }
    }
    set(name, value){
        console.log('override `set` method')
        super.set(name, value);
    }
    static aa(){
        super.aa()
    }
}
export var mainViewModel = new HelloWorldModel()
````

````javascript
// babel => es5,  this is horrible for nativescript
//
// 1. redundant es5 helper functions like `_createClass`, `_inherits` in every files
//    => extract all babel-es5-helper-functions to a individual module, and then require it.
// 2. babel module system is not ipentity with nativescript(cmd) like the `default` attribute in module.exports
//    => stop `_interopRequireWildcard` and `_interopRequireDefault` the required object 
//        that it add `default` attribute and replace all attribute from the origin to 
//        a new object which the original object is bind to the system like `application.mainModule`!
// 3. babel-es5's Class System is different with nativescript.
//    => every class which inherit the tns-core-module will be replaced to the nativescript inheritence way.
//    => nativescript's inheritence have weak feature that `__extends(Child, Super);` must be the 
//        first sentence in the Class block, means if this sentence execute after any operate to 
//        the Child-Class, nativescript will be crashed!!

"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; desc = parent = getter = undefined; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; continue _function; } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj["default"] = obj; return newObj; } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _dataObservable = require("data/observable");

var observable = _interopRequireWildcard(_dataObservable);

var HelloWorldModel = (function (_observable$Observable) {
    _inherits(HelloWorldModel, _observable$Observable);

    function HelloWorldModel() {
        _classCallCheck(this, HelloWorldModel);

        _get(Object.getPrototypeOf(HelloWorldModel.prototype), "constructor", this).call(this);
        this.counter = 42;
        this.set("message", this.counter + " taps left");
    }

    _createClass(HelloWorldModel, [{
        key: "tapAction",
        value: function tapAction() {
            this.counter--;
            if (this.counter <= 0) {
                this.set("message", "Hoorraaay! You unlocked the NativeScript clicker achievement!");
            } else {
                this.set("message", this.counter + " taps left");
            }
        }
    }, {
        key: "set",
        value: function set(name, value) {
            console.log('override `set` method');
            _get(Object.getPrototypeOf(HelloWorldModel.prototype), "set", this).call(this, name, value);
        }
    }], [{
        key: "aa",
        value: function aa() {
            _get(Object.getPrototypeOf(HelloWorldModel), "aa", this).call(this);
        }
    }]);

    return HelloWorldModel;
})(observable.Observable);

exports.HelloWorldModel = HelloWorldModel;
var mainViewModel = new HelloWorldModel();
exports.mainViewModel = mainViewModel;
````

```javascript
// es5 after this tool replaced the babel-es5 content
"use strict";
// this module path is the function's second argument as a absolute path
var _babelEs5CommonUtil = require("../utils/babel-es5-common-helpers");

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _dataObservable = require("data/observable");

var observable = _dataObservable;

var HelloWorldModel = (function (_observable$Observable) {
    __extends(HelloWorldModel, _observable$Observable);

    function HelloWorldModel() {
        _babelEs5CommonUtil._classCallCheck(this, HelloWorldModel);

        _observable$Observable.call(this);
        this.counter = 42;
        this.set("message", this.counter + " taps left");
    }

    _babelEs5CommonUtil._createClass(HelloWorldModel, [{
        key: "tapAction",
        value: function tapAction() {
            this.counter--;
            if (this.counter <= 0) {
                this.set("message", "Hoorraaay! You unlocked the NativeScript clicker achievement!");
            } else {
                this.set("message", this.counter + " taps left");
            }
        }
    }, {
        key: "set",
        value: function set(name, value) {
            console.log('override `set` method');
            _observable$Observable.prototype.set.call(this, name, value);
        }
    }], [{
        key: "aa",
        value: function aa() {
            _observable$Observable.aa.call(HelloWorldModel);
        }
    }]);

    return HelloWorldModel;
})(observable.Observable);

exports.HelloWorldModel = HelloWorldModel;
var mainViewModel = new HelloWorldModel();
exports.mainViewModel = mainViewModel;
```
