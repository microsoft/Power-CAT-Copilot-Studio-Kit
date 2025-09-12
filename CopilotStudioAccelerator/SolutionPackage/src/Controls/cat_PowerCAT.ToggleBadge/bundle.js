/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
var pcf_tools_652ac3f36e1e4bca82eb3c1dc44e6fad;
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./ToggleBadge/ToggleBadgeControl.tsx":
/*!********************************************!*\
  !*** ./ToggleBadge/ToggleBadgeControl.tsx ***!
  \********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   ToggleBadgeControl: () => (/* binding */ ToggleBadgeControl)\n/* harmony export */ });\n/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ \"react\");\n/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var _fluentui_react_components__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @fluentui/react-components */ \"@fluentui/react-components\");\n/* harmony import */ var _fluentui_react_components__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_fluentui_react_components__WEBPACK_IMPORTED_MODULE_1__);\n\n\nvar ToggleBadgeControl = _ref => {\n  var {\n    value,\n    onText,\n    offText,\n    size\n  } = _ref;\n  var isOn = !!value;\n  return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement(\"div\", {\n    style: {\n      display: \"flex\",\n      alignItems: \"center\"\n    }\n  }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement(_fluentui_react_components__WEBPACK_IMPORTED_MODULE_1__.Badge, {\n    shape: \"rounded\",\n    size: size !== null && size !== void 0 ? size : \"large\",\n    color: isOn ? \"brand\" : \"informative\"\n  }, isOn ? typeof onText === 'string' && onText.length > 0 ? onText : \"On\" : typeof offText === 'string' && offText.length > 0 ? offText : \"Off\"));\n};\n\n//# sourceURL=webpack://pcf_tools_652ac3f36e1e4bca82eb3c1dc44e6fad/./ToggleBadge/ToggleBadgeControl.tsx?\n}");

/***/ }),

/***/ "./ToggleBadge/index.ts":
/*!******************************!*\
  !*** ./ToggleBadge/index.ts ***!
  \******************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   ToggleBadge: () => (/* binding */ ToggleBadge)\n/* harmony export */ });\n/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ \"react\");\n/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var _ToggleBadgeControl__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./ToggleBadgeControl */ \"./ToggleBadge/ToggleBadgeControl.tsx\");\n\n\nclass ToggleBadge {\n  /**\n   * Used to initialize the control instance. Controls can kick off remote server calls and other initialization actions here.\n   * Data-set values are not initialized here, use updateView.\n   * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to property names defined in the manifest, as well as utility functions.\n   * @param notifyOutputChanged A callback method to alert the framework that the control has new outputs ready to be retrieved asynchronously.\n   * @param state A piece of data that persists in one session for a single user. Can be set at any point in a controls life cycle by calling 'setControlState' in the Mode interface.\n   */\n  init(context, notifyOutputChanged, state) {\n    this.notifyOutputChanged = notifyOutputChanged;\n  }\n  /**\n   * Called when any value in the property bag has changed. This includes field values, data-sets, global values such as container height and width, offline status, control metadata values such as label, visible, etc.\n   * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to names defined in the manifest, as well as utility functions\n   * @returns ReactElement root react element for the control\n   */\n  updateView(context) {\n    var _a, _b, _c, _d, _e, _f, _g;\n    var value = (_b = (_a = context.parameters.toggleState) === null || _a === void 0 ? void 0 : _a.raw) !== null && _b !== void 0 ? _b : false;\n    var onText = (_d = (_c = context.parameters.onText) === null || _c === void 0 ? void 0 : _c.raw) !== null && _d !== void 0 ? _d : \"On\";\n    var offText = (_f = (_e = context.parameters.offText) === null || _e === void 0 ? void 0 : _e.raw) !== null && _f !== void 0 ? _f : \"Off\";\n    var size = (_g = context.parameters.size) === null || _g === void 0 ? void 0 : _g.raw;\n    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement(_ToggleBadgeControl__WEBPACK_IMPORTED_MODULE_1__.ToggleBadgeControl, {\n      value,\n      onText,\n      offText,\n      size\n    });\n  }\n  /**\n   * It is called by the framework prior to a control receiving new data.\n   * @returns an object based on nomenclature defined in manifest, expecting object[s] for property marked as \"bound\" or \"output\"\n   */\n  getOutputs() {\n    return {};\n  }\n  /**\n   * Called when the control is to be removed from the DOM tree. Controls should use this call for cleanup.\n   * i.e. cancelling any pending remote calls, removing listeners, etc.\n   */\n  destroy() {\n    // No cleanup required\n  }\n}\n\n//# sourceURL=webpack://pcf_tools_652ac3f36e1e4bca82eb3c1dc44e6fad/./ToggleBadge/index.ts?\n}");

/***/ }),

/***/ "@fluentui/react-components":
/*!************************************!*\
  !*** external "FluentUIReactv940" ***!
  \************************************/
/***/ ((module) => {

module.exports = FluentUIReactv940;

/***/ }),

/***/ "react":
/*!***************************!*\
  !*** external "Reactv16" ***!
  \***************************/
/***/ ((module) => {

module.exports = Reactv16;

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = __webpack_require__("./ToggleBadge/index.ts");
/******/ 	pcf_tools_652ac3f36e1e4bca82eb3c1dc44e6fad = __webpack_exports__;
/******/ 	
/******/ })()
;
if (window.ComponentFramework && window.ComponentFramework.registerControl) {
	ComponentFramework.registerControl('PowerCAT.ToggleBadge', pcf_tools_652ac3f36e1e4bca82eb3c1dc44e6fad.ToggleBadge);
} else {
	var PowerCAT = PowerCAT || {};
	PowerCAT.ToggleBadge = pcf_tools_652ac3f36e1e4bca82eb3c1dc44e6fad.ToggleBadge;
	pcf_tools_652ac3f36e1e4bca82eb3c1dc44e6fad = undefined;
}