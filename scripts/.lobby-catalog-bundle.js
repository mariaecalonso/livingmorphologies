"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/react/cjs/react.development.js
  var require_react_development = __commonJS({
    "node_modules/react/cjs/react.development.js"(exports, module) {
      "use strict";
      (function() {
        function defineDeprecationWarning(methodName, info) {
          Object.defineProperty(Component.prototype, methodName, {
            get: function() {
              console.warn(
                "%s(...) is deprecated in plain JavaScript React classes. %s",
                info[0],
                info[1]
              );
            }
          });
        }
        function getIteratorFn(maybeIterable) {
          if (null === maybeIterable || "object" !== typeof maybeIterable)
            return null;
          maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
          return "function" === typeof maybeIterable ? maybeIterable : null;
        }
        function warnNoop(publicInstance, callerName) {
          publicInstance = (publicInstance = publicInstance.constructor) && (publicInstance.displayName || publicInstance.name) || "ReactClass";
          var warningKey = publicInstance + "." + callerName;
          didWarnStateUpdateForUnmountedComponent[warningKey] || (console.error(
            "Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.",
            callerName,
            publicInstance
          ), didWarnStateUpdateForUnmountedComponent[warningKey] = true);
        }
        function Component(props, context, updater) {
          this.props = props;
          this.context = context;
          this.refs = emptyObject;
          this.updater = updater || ReactNoopUpdateQueue;
        }
        function ComponentDummy() {
        }
        function PureComponent(props, context, updater) {
          this.props = props;
          this.context = context;
          this.refs = emptyObject;
          this.updater = updater || ReactNoopUpdateQueue;
        }
        function noop() {
        }
        function testStringCoercion(value) {
          return "" + value;
        }
        function checkKeyStringCoercion(value) {
          try {
            testStringCoercion(value);
            var JSCompiler_inline_result = false;
          } catch (e) {
            JSCompiler_inline_result = true;
          }
          if (JSCompiler_inline_result) {
            JSCompiler_inline_result = console;
            var JSCompiler_temp_const = JSCompiler_inline_result.error;
            var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
            JSCompiler_temp_const.call(
              JSCompiler_inline_result,
              "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
              JSCompiler_inline_result$jscomp$0
            );
            return testStringCoercion(value);
          }
        }
        function getComponentNameFromType(type) {
          if (null == type) return null;
          if ("function" === typeof type)
            return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
          if ("string" === typeof type) return type;
          switch (type) {
            case REACT_FRAGMENT_TYPE:
              return "Fragment";
            case REACT_PROFILER_TYPE:
              return "Profiler";
            case REACT_STRICT_MODE_TYPE:
              return "StrictMode";
            case REACT_SUSPENSE_TYPE:
              return "Suspense";
            case REACT_SUSPENSE_LIST_TYPE:
              return "SuspenseList";
            case REACT_ACTIVITY_TYPE:
              return "Activity";
          }
          if ("object" === typeof type)
            switch ("number" === typeof type.tag && console.error(
              "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
            ), type.$$typeof) {
              case REACT_PORTAL_TYPE:
                return "Portal";
              case REACT_CONTEXT_TYPE:
                return type.displayName || "Context";
              case REACT_CONSUMER_TYPE:
                return (type._context.displayName || "Context") + ".Consumer";
              case REACT_FORWARD_REF_TYPE:
                var innerType = type.render;
                type = type.displayName;
                type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
                return type;
              case REACT_MEMO_TYPE:
                return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
              case REACT_LAZY_TYPE:
                innerType = type._payload;
                type = type._init;
                try {
                  return getComponentNameFromType(type(innerType));
                } catch (x) {
                }
            }
          return null;
        }
        function getTaskName(type) {
          if (type === REACT_FRAGMENT_TYPE) return "<>";
          if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE)
            return "<...>";
          try {
            var name = getComponentNameFromType(type);
            return name ? "<" + name + ">" : "<...>";
          } catch (x) {
            return "<...>";
          }
        }
        function getOwner() {
          var dispatcher = ReactSharedInternals.A;
          return null === dispatcher ? null : dispatcher.getOwner();
        }
        function UnknownOwner() {
          return Error("react-stack-top-frame");
        }
        function hasValidKey(config) {
          if (hasOwnProperty.call(config, "key")) {
            var getter = Object.getOwnPropertyDescriptor(config, "key").get;
            if (getter && getter.isReactWarning) return false;
          }
          return void 0 !== config.key;
        }
        function defineKeyPropWarningGetter(props, displayName) {
          function warnAboutAccessingKey() {
            specialPropKeyWarningShown || (specialPropKeyWarningShown = true, console.error(
              "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
              displayName
            ));
          }
          warnAboutAccessingKey.isReactWarning = true;
          Object.defineProperty(props, "key", {
            get: warnAboutAccessingKey,
            configurable: true
          });
        }
        function elementRefGetterWithDeprecationWarning() {
          var componentName = getComponentNameFromType(this.type);
          didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = true, console.error(
            "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
          ));
          componentName = this.props.ref;
          return void 0 !== componentName ? componentName : null;
        }
        function ReactElement(type, key, props, owner, debugStack, debugTask) {
          var refProp = props.ref;
          type = {
            $$typeof: REACT_ELEMENT_TYPE,
            type,
            key,
            props,
            _owner: owner
          };
          null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
            enumerable: false,
            get: elementRefGetterWithDeprecationWarning
          }) : Object.defineProperty(type, "ref", { enumerable: false, value: null });
          type._store = {};
          Object.defineProperty(type._store, "validated", {
            configurable: false,
            enumerable: false,
            writable: true,
            value: 0
          });
          Object.defineProperty(type, "_debugInfo", {
            configurable: false,
            enumerable: false,
            writable: true,
            value: null
          });
          Object.defineProperty(type, "_debugStack", {
            configurable: false,
            enumerable: false,
            writable: true,
            value: debugStack
          });
          Object.defineProperty(type, "_debugTask", {
            configurable: false,
            enumerable: false,
            writable: true,
            value: debugTask
          });
          Object.freeze && (Object.freeze(type.props), Object.freeze(type));
          return type;
        }
        function cloneAndReplaceKey(oldElement, newKey) {
          newKey = ReactElement(
            oldElement.type,
            newKey,
            oldElement.props,
            oldElement._owner,
            oldElement._debugStack,
            oldElement._debugTask
          );
          oldElement._store && (newKey._store.validated = oldElement._store.validated);
          return newKey;
        }
        function validateChildKeys(node3) {
          isValidElement(node3) ? node3._store && (node3._store.validated = 1) : "object" === typeof node3 && null !== node3 && node3.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node3._payload.status ? isValidElement(node3._payload.value) && node3._payload.value._store && (node3._payload.value._store.validated = 1) : node3._store && (node3._store.validated = 1));
        }
        function isValidElement(object) {
          return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
        }
        function escape(key) {
          var escaperLookup = { "=": "=0", ":": "=2" };
          return "$" + key.replace(/[=:]/g, function(match) {
            return escaperLookup[match];
          });
        }
        function getElementKey(element, index2) {
          return "object" === typeof element && null !== element && null != element.key ? (checkKeyStringCoercion(element.key), escape("" + element.key)) : index2.toString(36);
        }
        function resolveThenable(thenable) {
          switch (thenable.status) {
            case "fulfilled":
              return thenable.value;
            case "rejected":
              throw thenable.reason;
            default:
              switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(
                function(fulfilledValue) {
                  "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
                },
                function(error) {
                  "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
                }
              )), thenable.status) {
                case "fulfilled":
                  return thenable.value;
                case "rejected":
                  throw thenable.reason;
              }
          }
          throw thenable;
        }
        function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
          var type = typeof children;
          if ("undefined" === type || "boolean" === type) children = null;
          var invokeCallback = false;
          if (null === children) invokeCallback = true;
          else
            switch (type) {
              case "bigint":
              case "string":
              case "number":
                invokeCallback = true;
                break;
              case "object":
                switch (children.$$typeof) {
                  case REACT_ELEMENT_TYPE:
                  case REACT_PORTAL_TYPE:
                    invokeCallback = true;
                    break;
                  case REACT_LAZY_TYPE:
                    return invokeCallback = children._init, mapIntoArray(
                      invokeCallback(children._payload),
                      array,
                      escapedPrefix,
                      nameSoFar,
                      callback
                    );
                }
            }
          if (invokeCallback) {
            invokeCallback = children;
            callback = callback(invokeCallback);
            var childKey = "" === nameSoFar ? "." + getElementKey(invokeCallback, 0) : nameSoFar;
            isArrayImpl(callback) ? (escapedPrefix = "", null != childKey && (escapedPrefix = childKey.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
              return c;
            })) : null != callback && (isValidElement(callback) && (null != callback.key && (invokeCallback && invokeCallback.key === callback.key || checkKeyStringCoercion(callback.key)), escapedPrefix = cloneAndReplaceKey(
              callback,
              escapedPrefix + (null == callback.key || invokeCallback && invokeCallback.key === callback.key ? "" : ("" + callback.key).replace(
                userProvidedKeyEscapeRegex,
                "$&/"
              ) + "/") + childKey
            ), "" !== nameSoFar && null != invokeCallback && isValidElement(invokeCallback) && null == invokeCallback.key && invokeCallback._store && !invokeCallback._store.validated && (escapedPrefix._store.validated = 2), callback = escapedPrefix), array.push(callback));
            return 1;
          }
          invokeCallback = 0;
          childKey = "" === nameSoFar ? "." : nameSoFar + ":";
          if (isArrayImpl(children))
            for (var i = 0; i < children.length; i++)
              nameSoFar = children[i], type = childKey + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
                nameSoFar,
                array,
                escapedPrefix,
                type,
                callback
              );
          else if (i = getIteratorFn(children), "function" === typeof i)
            for (i === children.entries && (didWarnAboutMaps || console.warn(
              "Using Maps as children is not supported. Use an array of keyed ReactElements instead."
            ), didWarnAboutMaps = true), children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
              nameSoFar = nameSoFar.value, type = childKey + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
                nameSoFar,
                array,
                escapedPrefix,
                type,
                callback
              );
          else if ("object" === type) {
            if ("function" === typeof children.then)
              return mapIntoArray(
                resolveThenable(children),
                array,
                escapedPrefix,
                nameSoFar,
                callback
              );
            array = String(children);
            throw Error(
              "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
            );
          }
          return invokeCallback;
        }
        function mapChildren(children, func, context) {
          if (null == children) return children;
          var result = [], count = 0;
          mapIntoArray(children, result, "", "", function(child) {
            return func.call(context, child, count++);
          });
          return result;
        }
        function lazyInitializer(payload) {
          if (-1 === payload._status) {
            var ioInfo = payload._ioInfo;
            null != ioInfo && (ioInfo.start = ioInfo.end = performance.now());
            ioInfo = payload._result;
            var thenable = ioInfo();
            thenable.then(
              function(moduleObject) {
                if (0 === payload._status || -1 === payload._status) {
                  payload._status = 1;
                  payload._result = moduleObject;
                  var _ioInfo = payload._ioInfo;
                  null != _ioInfo && (_ioInfo.end = performance.now());
                  void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
                }
              },
              function(error) {
                if (0 === payload._status || -1 === payload._status) {
                  payload._status = 2;
                  payload._result = error;
                  var _ioInfo2 = payload._ioInfo;
                  null != _ioInfo2 && (_ioInfo2.end = performance.now());
                  void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
                }
              }
            );
            ioInfo = payload._ioInfo;
            if (null != ioInfo) {
              ioInfo.value = thenable;
              var displayName = thenable.displayName;
              "string" === typeof displayName && (ioInfo.name = displayName);
            }
            -1 === payload._status && (payload._status = 0, payload._result = thenable);
          }
          if (1 === payload._status)
            return ioInfo = payload._result, void 0 === ioInfo && console.error(
              "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?",
              ioInfo
            ), "default" in ioInfo || console.error(
              "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))",
              ioInfo
            ), ioInfo.default;
          throw payload._result;
        }
        function resolveDispatcher() {
          var dispatcher = ReactSharedInternals.H;
          null === dispatcher && console.error(
            "Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem."
          );
          return dispatcher;
        }
        function releaseAsyncTransition() {
          ReactSharedInternals.asyncTransitions--;
        }
        function enqueueTask(task) {
          if (null === enqueueTaskImpl)
            try {
              var requireString = ("require" + Math.random()).slice(0, 7);
              enqueueTaskImpl = (module && module[requireString]).call(
                module,
                "timers"
              ).setImmediate;
            } catch (_err) {
              enqueueTaskImpl = function(callback) {
                false === didWarnAboutMessageChannel && (didWarnAboutMessageChannel = true, "undefined" === typeof MessageChannel && console.error(
                  "This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning."
                ));
                var channel = new MessageChannel();
                channel.port1.onmessage = callback;
                channel.port2.postMessage(void 0);
              };
            }
          return enqueueTaskImpl(task);
        }
        function aggregateErrors(errors) {
          return 1 < errors.length && "function" === typeof AggregateError ? new AggregateError(errors) : errors[0];
        }
        function popActScope(prevActQueue, prevActScopeDepth) {
          prevActScopeDepth !== actScopeDepth - 1 && console.error(
            "You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. "
          );
          actScopeDepth = prevActScopeDepth;
        }
        function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
          var queue = ReactSharedInternals.actQueue;
          if (null !== queue)
            if (0 !== queue.length)
              try {
                flushActQueue(queue);
                enqueueTask(function() {
                  return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
                });
                return;
              } catch (error) {
                ReactSharedInternals.thrownErrors.push(error);
              }
            else ReactSharedInternals.actQueue = null;
          0 < ReactSharedInternals.thrownErrors.length ? (queue = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(queue)) : resolve(returnValue);
        }
        function flushActQueue(queue) {
          if (!isFlushing) {
            isFlushing = true;
            var i = 0;
            try {
              for (; i < queue.length; i++) {
                var callback = queue[i];
                do {
                  ReactSharedInternals.didUsePromise = false;
                  var continuation = callback(false);
                  if (null !== continuation) {
                    if (ReactSharedInternals.didUsePromise) {
                      queue[i] = callback;
                      queue.splice(0, i);
                      return;
                    }
                    callback = continuation;
                  } else break;
                } while (1);
              }
              queue.length = 0;
            } catch (error) {
              queue.splice(0, i + 1), ReactSharedInternals.thrownErrors.push(error);
            } finally {
              isFlushing = false;
            }
          }
        }
        "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
        var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = /* @__PURE__ */ Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo"), REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = /* @__PURE__ */ Symbol.for("react.activity"), MAYBE_ITERATOR_SYMBOL = Symbol.iterator, didWarnStateUpdateForUnmountedComponent = {}, ReactNoopUpdateQueue = {
          isMounted: function() {
            return false;
          },
          enqueueForceUpdate: function(publicInstance) {
            warnNoop(publicInstance, "forceUpdate");
          },
          enqueueReplaceState: function(publicInstance) {
            warnNoop(publicInstance, "replaceState");
          },
          enqueueSetState: function(publicInstance) {
            warnNoop(publicInstance, "setState");
          }
        }, assign = Object.assign, emptyObject = {};
        Object.freeze(emptyObject);
        Component.prototype.isReactComponent = {};
        Component.prototype.setState = function(partialState, callback) {
          if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
            throw Error(
              "takes an object of state variables to update or a function which returns an object of state variables."
            );
          this.updater.enqueueSetState(this, partialState, callback, "setState");
        };
        Component.prototype.forceUpdate = function(callback) {
          this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
        };
        var deprecatedAPIs = {
          isMounted: [
            "isMounted",
            "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."
          ],
          replaceState: [
            "replaceState",
            "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."
          ]
        };
        for (fnName in deprecatedAPIs)
          deprecatedAPIs.hasOwnProperty(fnName) && defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
        ComponentDummy.prototype = Component.prototype;
        deprecatedAPIs = PureComponent.prototype = new ComponentDummy();
        deprecatedAPIs.constructor = PureComponent;
        assign(deprecatedAPIs, Component.prototype);
        deprecatedAPIs.isPureReactComponent = true;
        var isArrayImpl = Array.isArray, REACT_CLIENT_REFERENCE = /* @__PURE__ */ Symbol.for("react.client.reference"), ReactSharedInternals = {
          H: null,
          A: null,
          T: null,
          S: null,
          actQueue: null,
          asyncTransitions: 0,
          isBatchingLegacy: false,
          didScheduleLegacyUpdate: false,
          didUsePromise: false,
          thrownErrors: [],
          getCurrentStack: null,
          recentlyCreatedOwnerStacks: 0
        }, hasOwnProperty = Object.prototype.hasOwnProperty, createTask = console.createTask ? console.createTask : function() {
          return null;
        };
        deprecatedAPIs = {
          react_stack_bottom_frame: function(callStackForError) {
            return callStackForError();
          }
        };
        var specialPropKeyWarningShown, didWarnAboutOldJSXRuntime;
        var didWarnAboutElementRef = {};
        var unknownOwnerDebugStack = deprecatedAPIs.react_stack_bottom_frame.bind(
          deprecatedAPIs,
          UnknownOwner
        )();
        var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
        var didWarnAboutMaps = false, userProvidedKeyEscapeRegex = /\/+/g, reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
          if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
            var event = new window.ErrorEvent("error", {
              bubbles: true,
              cancelable: true,
              message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
              error
            });
            if (!window.dispatchEvent(event)) return;
          } else if ("object" === typeof process && "function" === typeof process.emit) {
            process.emit("uncaughtException", error);
            return;
          }
          console.error(error);
        }, didWarnAboutMessageChannel = false, enqueueTaskImpl = null, actScopeDepth = 0, didWarnNoAwaitAct = false, isFlushing = false, queueSeveralMicrotasks = "function" === typeof queueMicrotask ? function(callback) {
          queueMicrotask(function() {
            return queueMicrotask(callback);
          });
        } : enqueueTask;
        deprecatedAPIs = Object.freeze({
          __proto__: null,
          c: function(size) {
            return resolveDispatcher().useMemoCache(size);
          }
        });
        var fnName = {
          map: mapChildren,
          forEach: function(children, forEachFunc, forEachContext) {
            mapChildren(
              children,
              function() {
                forEachFunc.apply(this, arguments);
              },
              forEachContext
            );
          },
          count: function(children) {
            var n = 0;
            mapChildren(children, function() {
              n++;
            });
            return n;
          },
          toArray: function(children) {
            return mapChildren(children, function(child) {
              return child;
            }) || [];
          },
          only: function(children) {
            if (!isValidElement(children))
              throw Error(
                "React.Children.only expected to receive a single React element child."
              );
            return children;
          }
        };
        exports.Activity = REACT_ACTIVITY_TYPE;
        exports.Children = fnName;
        exports.Component = Component;
        exports.Fragment = REACT_FRAGMENT_TYPE;
        exports.Profiler = REACT_PROFILER_TYPE;
        exports.PureComponent = PureComponent;
        exports.StrictMode = REACT_STRICT_MODE_TYPE;
        exports.Suspense = REACT_SUSPENSE_TYPE;
        exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
        exports.__COMPILER_RUNTIME = deprecatedAPIs;
        exports.act = function(callback) {
          var prevActQueue = ReactSharedInternals.actQueue, prevActScopeDepth = actScopeDepth;
          actScopeDepth++;
          var queue = ReactSharedInternals.actQueue = null !== prevActQueue ? prevActQueue : [], didAwaitActCall = false;
          try {
            var result = callback();
          } catch (error) {
            ReactSharedInternals.thrownErrors.push(error);
          }
          if (0 < ReactSharedInternals.thrownErrors.length)
            throw popActScope(prevActQueue, prevActScopeDepth), callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
          if (null !== result && "object" === typeof result && "function" === typeof result.then) {
            var thenable = result;
            queueSeveralMicrotasks(function() {
              didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
                "You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);"
              ));
            });
            return {
              then: function(resolve, reject) {
                didAwaitActCall = true;
                thenable.then(
                  function(returnValue) {
                    popActScope(prevActQueue, prevActScopeDepth);
                    if (0 === prevActScopeDepth) {
                      try {
                        flushActQueue(queue), enqueueTask(function() {
                          return recursivelyFlushAsyncActWork(
                            returnValue,
                            resolve,
                            reject
                          );
                        });
                      } catch (error$0) {
                        ReactSharedInternals.thrownErrors.push(error$0);
                      }
                      if (0 < ReactSharedInternals.thrownErrors.length) {
                        var _thrownError = aggregateErrors(
                          ReactSharedInternals.thrownErrors
                        );
                        ReactSharedInternals.thrownErrors.length = 0;
                        reject(_thrownError);
                      }
                    } else resolve(returnValue);
                  },
                  function(error) {
                    popActScope(prevActQueue, prevActScopeDepth);
                    0 < ReactSharedInternals.thrownErrors.length ? (error = aggregateErrors(
                      ReactSharedInternals.thrownErrors
                    ), ReactSharedInternals.thrownErrors.length = 0, reject(error)) : reject(error);
                  }
                );
              }
            };
          }
          var returnValue$jscomp$0 = result;
          popActScope(prevActQueue, prevActScopeDepth);
          0 === prevActScopeDepth && (flushActQueue(queue), 0 !== queue.length && queueSeveralMicrotasks(function() {
            didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
              "A component suspended inside an `act` scope, but the `act` call was not awaited. When testing React components that depend on asynchronous data, you must await the result:\n\nawait act(() => ...)"
            ));
          }), ReactSharedInternals.actQueue = null);
          if (0 < ReactSharedInternals.thrownErrors.length)
            throw callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
          return {
            then: function(resolve, reject) {
              didAwaitActCall = true;
              0 === prevActScopeDepth ? (ReactSharedInternals.actQueue = queue, enqueueTask(function() {
                return recursivelyFlushAsyncActWork(
                  returnValue$jscomp$0,
                  resolve,
                  reject
                );
              })) : resolve(returnValue$jscomp$0);
            }
          };
        };
        exports.cache = function(fn) {
          return function() {
            return fn.apply(null, arguments);
          };
        };
        exports.cacheSignal = function() {
          return null;
        };
        exports.captureOwnerStack = function() {
          var getCurrentStack = ReactSharedInternals.getCurrentStack;
          return null === getCurrentStack ? null : getCurrentStack();
        };
        exports.cloneElement = function(element, config, children) {
          if (null === element || void 0 === element)
            throw Error(
              "The argument must be a React element, but you passed " + element + "."
            );
          var props = assign({}, element.props), key = element.key, owner = element._owner;
          if (null != config) {
            var JSCompiler_inline_result;
            a: {
              if (hasOwnProperty.call(config, "ref") && (JSCompiler_inline_result = Object.getOwnPropertyDescriptor(
                config,
                "ref"
              ).get) && JSCompiler_inline_result.isReactWarning) {
                JSCompiler_inline_result = false;
                break a;
              }
              JSCompiler_inline_result = void 0 !== config.ref;
            }
            JSCompiler_inline_result && (owner = getOwner());
            hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key);
            for (propName in config)
              !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
          }
          var propName = arguments.length - 2;
          if (1 === propName) props.children = children;
          else if (1 < propName) {
            JSCompiler_inline_result = Array(propName);
            for (var i = 0; i < propName; i++)
              JSCompiler_inline_result[i] = arguments[i + 2];
            props.children = JSCompiler_inline_result;
          }
          props = ReactElement(
            element.type,
            key,
            props,
            owner,
            element._debugStack,
            element._debugTask
          );
          for (key = 2; key < arguments.length; key++)
            validateChildKeys(arguments[key]);
          return props;
        };
        exports.createContext = function(defaultValue) {
          defaultValue = {
            $$typeof: REACT_CONTEXT_TYPE,
            _currentValue: defaultValue,
            _currentValue2: defaultValue,
            _threadCount: 0,
            Provider: null,
            Consumer: null
          };
          defaultValue.Provider = defaultValue;
          defaultValue.Consumer = {
            $$typeof: REACT_CONSUMER_TYPE,
            _context: defaultValue
          };
          defaultValue._currentRenderer = null;
          defaultValue._currentRenderer2 = null;
          return defaultValue;
        };
        exports.createElement = function(type, config, children) {
          for (var i = 2; i < arguments.length; i++)
            validateChildKeys(arguments[i]);
          i = {};
          var key = null;
          if (null != config)
            for (propName in didWarnAboutOldJSXRuntime || !("__self" in config) || "key" in config || (didWarnAboutOldJSXRuntime = true, console.warn(
              "Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance: https://react.dev/link/new-jsx-transform"
            )), hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key), config)
              hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (i[propName] = config[propName]);
          var childrenLength = arguments.length - 2;
          if (1 === childrenLength) i.children = children;
          else if (1 < childrenLength) {
            for (var childArray = Array(childrenLength), _i = 0; _i < childrenLength; _i++)
              childArray[_i] = arguments[_i + 2];
            Object.freeze && Object.freeze(childArray);
            i.children = childArray;
          }
          if (type && type.defaultProps)
            for (propName in childrenLength = type.defaultProps, childrenLength)
              void 0 === i[propName] && (i[propName] = childrenLength[propName]);
          key && defineKeyPropWarningGetter(
            i,
            "function" === typeof type ? type.displayName || type.name || "Unknown" : type
          );
          var propName = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
          return ReactElement(
            type,
            key,
            i,
            getOwner(),
            propName ? Error("react-stack-top-frame") : unknownOwnerDebugStack,
            propName ? createTask(getTaskName(type)) : unknownOwnerDebugTask
          );
        };
        exports.createRef = function() {
          var refObject = { current: null };
          Object.seal(refObject);
          return refObject;
        };
        exports.forwardRef = function(render) {
          null != render && render.$$typeof === REACT_MEMO_TYPE ? console.error(
            "forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...))."
          ) : "function" !== typeof render ? console.error(
            "forwardRef requires a render function but was given %s.",
            null === render ? "null" : typeof render
          ) : 0 !== render.length && 2 !== render.length && console.error(
            "forwardRef render functions accept exactly two parameters: props and ref. %s",
            1 === render.length ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined."
          );
          null != render && null != render.defaultProps && console.error(
            "forwardRef render functions do not support defaultProps. Did you accidentally pass a React component?"
          );
          var elementType = { $$typeof: REACT_FORWARD_REF_TYPE, render }, ownName;
          Object.defineProperty(elementType, "displayName", {
            enumerable: false,
            configurable: true,
            get: function() {
              return ownName;
            },
            set: function(name) {
              ownName = name;
              render.name || render.displayName || (Object.defineProperty(render, "name", { value: name }), render.displayName = name);
            }
          });
          return elementType;
        };
        exports.isValidElement = isValidElement;
        exports.lazy = function(ctor) {
          ctor = { _status: -1, _result: ctor };
          var lazyType = {
            $$typeof: REACT_LAZY_TYPE,
            _payload: ctor,
            _init: lazyInitializer
          }, ioInfo = {
            name: "lazy",
            start: -1,
            end: -1,
            value: null,
            owner: null,
            debugStack: Error("react-stack-top-frame"),
            debugTask: console.createTask ? console.createTask("lazy()") : null
          };
          ctor._ioInfo = ioInfo;
          lazyType._debugInfo = [{ awaited: ioInfo }];
          return lazyType;
        };
        exports.memo = function(type, compare) {
          null == type && console.error(
            "memo: The first argument must be a component. Instead received: %s",
            null === type ? "null" : typeof type
          );
          compare = {
            $$typeof: REACT_MEMO_TYPE,
            type,
            compare: void 0 === compare ? null : compare
          };
          var ownName;
          Object.defineProperty(compare, "displayName", {
            enumerable: false,
            configurable: true,
            get: function() {
              return ownName;
            },
            set: function(name) {
              ownName = name;
              type.name || type.displayName || (Object.defineProperty(type, "name", { value: name }), type.displayName = name);
            }
          });
          return compare;
        };
        exports.startTransition = function(scope) {
          var prevTransition = ReactSharedInternals.T, currentTransition = {};
          currentTransition._updatedFibers = /* @__PURE__ */ new Set();
          ReactSharedInternals.T = currentTransition;
          try {
            var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
            null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
            "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && (ReactSharedInternals.asyncTransitions++, returnValue.then(releaseAsyncTransition, releaseAsyncTransition), returnValue.then(noop, reportGlobalError));
          } catch (error) {
            reportGlobalError(error);
          } finally {
            null === prevTransition && currentTransition._updatedFibers && (scope = currentTransition._updatedFibers.size, currentTransition._updatedFibers.clear(), 10 < scope && console.warn(
              "Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table."
            )), null !== prevTransition && null !== currentTransition.types && (null !== prevTransition.types && prevTransition.types !== currentTransition.types && console.error(
              "We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."
            ), prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
          }
        };
        exports.unstable_useCacheRefresh = function() {
          return resolveDispatcher().useCacheRefresh();
        };
        exports.use = function(usable) {
          return resolveDispatcher().use(usable);
        };
        exports.useActionState = function(action, initialState, permalink) {
          return resolveDispatcher().useActionState(
            action,
            initialState,
            permalink
          );
        };
        exports.useCallback = function(callback, deps) {
          return resolveDispatcher().useCallback(callback, deps);
        };
        exports.useContext = function(Context) {
          var dispatcher = resolveDispatcher();
          Context.$$typeof === REACT_CONSUMER_TYPE && console.error(
            "Calling useContext(Context.Consumer) is not supported and will cause bugs. Did you mean to call useContext(Context) instead?"
          );
          return dispatcher.useContext(Context);
        };
        exports.useDebugValue = function(value, formatterFn) {
          return resolveDispatcher().useDebugValue(value, formatterFn);
        };
        exports.useDeferredValue = function(value, initialValue) {
          return resolveDispatcher().useDeferredValue(value, initialValue);
        };
        exports.useEffect = function(create, deps) {
          null == create && console.warn(
            "React Hook useEffect requires an effect callback. Did you forget to pass a callback to the hook?"
          );
          return resolveDispatcher().useEffect(create, deps);
        };
        exports.useEffectEvent = function(callback) {
          return resolveDispatcher().useEffectEvent(callback);
        };
        exports.useId = function() {
          return resolveDispatcher().useId();
        };
        exports.useImperativeHandle = function(ref, create, deps) {
          return resolveDispatcher().useImperativeHandle(ref, create, deps);
        };
        exports.useInsertionEffect = function(create, deps) {
          null == create && console.warn(
            "React Hook useInsertionEffect requires an effect callback. Did you forget to pass a callback to the hook?"
          );
          return resolveDispatcher().useInsertionEffect(create, deps);
        };
        exports.useLayoutEffect = function(create, deps) {
          null == create && console.warn(
            "React Hook useLayoutEffect requires an effect callback. Did you forget to pass a callback to the hook?"
          );
          return resolveDispatcher().useLayoutEffect(create, deps);
        };
        exports.useMemo = function(create, deps) {
          return resolveDispatcher().useMemo(create, deps);
        };
        exports.useOptimistic = function(passthrough, reducer) {
          return resolveDispatcher().useOptimistic(passthrough, reducer);
        };
        exports.useReducer = function(reducer, initialArg, init) {
          return resolveDispatcher().useReducer(reducer, initialArg, init);
        };
        exports.useRef = function(initialValue) {
          return resolveDispatcher().useRef(initialValue);
        };
        exports.useState = function(initialState) {
          return resolveDispatcher().useState(initialState);
        };
        exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
          return resolveDispatcher().useSyncExternalStore(
            subscribe,
            getSnapshot,
            getServerSnapshot
          );
        };
        exports.useTransition = function() {
          return resolveDispatcher().useTransition();
        };
        exports.version = "19.2.8";
        "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
      })();
    }
  });

  // node_modules/react/index.js
  var require_react = __commonJS({
    "node_modules/react/index.js"(exports, module) {
      "use strict";
      if (false) {
        module.exports = null;
      } else {
        module.exports = require_react_development();
      }
    }
  });

  // node_modules/react/cjs/react-jsx-runtime.development.js
  var require_react_jsx_runtime_development = __commonJS({
    "node_modules/react/cjs/react-jsx-runtime.development.js"(exports) {
      "use strict";
      (function() {
        function getComponentNameFromType(type) {
          if (null == type) return null;
          if ("function" === typeof type)
            return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
          if ("string" === typeof type) return type;
          switch (type) {
            case REACT_FRAGMENT_TYPE:
              return "Fragment";
            case REACT_PROFILER_TYPE:
              return "Profiler";
            case REACT_STRICT_MODE_TYPE:
              return "StrictMode";
            case REACT_SUSPENSE_TYPE:
              return "Suspense";
            case REACT_SUSPENSE_LIST_TYPE:
              return "SuspenseList";
            case REACT_ACTIVITY_TYPE:
              return "Activity";
          }
          if ("object" === typeof type)
            switch ("number" === typeof type.tag && console.error(
              "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
            ), type.$$typeof) {
              case REACT_PORTAL_TYPE:
                return "Portal";
              case REACT_CONTEXT_TYPE:
                return type.displayName || "Context";
              case REACT_CONSUMER_TYPE:
                return (type._context.displayName || "Context") + ".Consumer";
              case REACT_FORWARD_REF_TYPE:
                var innerType = type.render;
                type = type.displayName;
                type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
                return type;
              case REACT_MEMO_TYPE:
                return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
              case REACT_LAZY_TYPE:
                innerType = type._payload;
                type = type._init;
                try {
                  return getComponentNameFromType(type(innerType));
                } catch (x) {
                }
            }
          return null;
        }
        function testStringCoercion(value) {
          return "" + value;
        }
        function checkKeyStringCoercion(value) {
          try {
            testStringCoercion(value);
            var JSCompiler_inline_result = false;
          } catch (e) {
            JSCompiler_inline_result = true;
          }
          if (JSCompiler_inline_result) {
            JSCompiler_inline_result = console;
            var JSCompiler_temp_const = JSCompiler_inline_result.error;
            var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
            JSCompiler_temp_const.call(
              JSCompiler_inline_result,
              "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
              JSCompiler_inline_result$jscomp$0
            );
            return testStringCoercion(value);
          }
        }
        function getTaskName(type) {
          if (type === REACT_FRAGMENT_TYPE) return "<>";
          if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE)
            return "<...>";
          try {
            var name = getComponentNameFromType(type);
            return name ? "<" + name + ">" : "<...>";
          } catch (x) {
            return "<...>";
          }
        }
        function getOwner() {
          var dispatcher = ReactSharedInternals.A;
          return null === dispatcher ? null : dispatcher.getOwner();
        }
        function UnknownOwner() {
          return Error("react-stack-top-frame");
        }
        function hasValidKey(config) {
          if (hasOwnProperty.call(config, "key")) {
            var getter = Object.getOwnPropertyDescriptor(config, "key").get;
            if (getter && getter.isReactWarning) return false;
          }
          return void 0 !== config.key;
        }
        function defineKeyPropWarningGetter(props, displayName) {
          function warnAboutAccessingKey() {
            specialPropKeyWarningShown || (specialPropKeyWarningShown = true, console.error(
              "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
              displayName
            ));
          }
          warnAboutAccessingKey.isReactWarning = true;
          Object.defineProperty(props, "key", {
            get: warnAboutAccessingKey,
            configurable: true
          });
        }
        function elementRefGetterWithDeprecationWarning() {
          var componentName = getComponentNameFromType(this.type);
          didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = true, console.error(
            "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
          ));
          componentName = this.props.ref;
          return void 0 !== componentName ? componentName : null;
        }
        function ReactElement(type, key, props, owner, debugStack, debugTask) {
          var refProp = props.ref;
          type = {
            $$typeof: REACT_ELEMENT_TYPE,
            type,
            key,
            props,
            _owner: owner
          };
          null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
            enumerable: false,
            get: elementRefGetterWithDeprecationWarning
          }) : Object.defineProperty(type, "ref", { enumerable: false, value: null });
          type._store = {};
          Object.defineProperty(type._store, "validated", {
            configurable: false,
            enumerable: false,
            writable: true,
            value: 0
          });
          Object.defineProperty(type, "_debugInfo", {
            configurable: false,
            enumerable: false,
            writable: true,
            value: null
          });
          Object.defineProperty(type, "_debugStack", {
            configurable: false,
            enumerable: false,
            writable: true,
            value: debugStack
          });
          Object.defineProperty(type, "_debugTask", {
            configurable: false,
            enumerable: false,
            writable: true,
            value: debugTask
          });
          Object.freeze && (Object.freeze(type.props), Object.freeze(type));
          return type;
        }
        function jsxDEVImpl(type, config, maybeKey, isStaticChildren, debugStack, debugTask) {
          var children = config.children;
          if (void 0 !== children)
            if (isStaticChildren)
              if (isArrayImpl(children)) {
                for (isStaticChildren = 0; isStaticChildren < children.length; isStaticChildren++)
                  validateChildKeys(children[isStaticChildren]);
                Object.freeze && Object.freeze(children);
              } else
                console.error(
                  "React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead."
                );
            else validateChildKeys(children);
          if (hasOwnProperty.call(config, "key")) {
            children = getComponentNameFromType(type);
            var keys = Object.keys(config).filter(function(k) {
              return "key" !== k;
            });
            isStaticChildren = 0 < keys.length ? "{key: someKey, " + keys.join(": ..., ") + ": ...}" : "{key: someKey}";
            didWarnAboutKeySpread[children + isStaticChildren] || (keys = 0 < keys.length ? "{" + keys.join(": ..., ") + ": ...}" : "{}", console.error(
              'A props object containing a "key" prop is being spread into JSX:\n  let props = %s;\n  <%s {...props} />\nReact keys must be passed directly to JSX without using spread:\n  let props = %s;\n  <%s key={someKey} {...props} />',
              isStaticChildren,
              children,
              keys,
              children
            ), didWarnAboutKeySpread[children + isStaticChildren] = true);
          }
          children = null;
          void 0 !== maybeKey && (checkKeyStringCoercion(maybeKey), children = "" + maybeKey);
          hasValidKey(config) && (checkKeyStringCoercion(config.key), children = "" + config.key);
          if ("key" in config) {
            maybeKey = {};
            for (var propName in config)
              "key" !== propName && (maybeKey[propName] = config[propName]);
          } else maybeKey = config;
          children && defineKeyPropWarningGetter(
            maybeKey,
            "function" === typeof type ? type.displayName || type.name || "Unknown" : type
          );
          return ReactElement(
            type,
            children,
            maybeKey,
            getOwner(),
            debugStack,
            debugTask
          );
        }
        function validateChildKeys(node3) {
          isValidElement(node3) ? node3._store && (node3._store.validated = 1) : "object" === typeof node3 && null !== node3 && node3.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node3._payload.status ? isValidElement(node3._payload.value) && node3._payload.value._store && (node3._payload.value._store.validated = 1) : node3._store && (node3._store.validated = 1));
        }
        function isValidElement(object) {
          return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
        }
        var React = require_react(), REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = /* @__PURE__ */ Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo"), REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = /* @__PURE__ */ Symbol.for("react.activity"), REACT_CLIENT_REFERENCE = /* @__PURE__ */ Symbol.for("react.client.reference"), ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, hasOwnProperty = Object.prototype.hasOwnProperty, isArrayImpl = Array.isArray, createTask = console.createTask ? console.createTask : function() {
          return null;
        };
        React = {
          react_stack_bottom_frame: function(callStackForError) {
            return callStackForError();
          }
        };
        var specialPropKeyWarningShown;
        var didWarnAboutElementRef = {};
        var unknownOwnerDebugStack = React.react_stack_bottom_frame.bind(
          React,
          UnknownOwner
        )();
        var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
        var didWarnAboutKeySpread = {};
        exports.Fragment = REACT_FRAGMENT_TYPE;
        exports.jsx = function(type, config, maybeKey) {
          var trackActualOwner = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
          return jsxDEVImpl(
            type,
            config,
            maybeKey,
            false,
            trackActualOwner ? Error("react-stack-top-frame") : unknownOwnerDebugStack,
            trackActualOwner ? createTask(getTaskName(type)) : unknownOwnerDebugTask
          );
        };
        exports.jsxs = function(type, config, maybeKey) {
          var trackActualOwner = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
          return jsxDEVImpl(
            type,
            config,
            maybeKey,
            true,
            trackActualOwner ? Error("react-stack-top-frame") : unknownOwnerDebugStack,
            trackActualOwner ? createTask(getTaskName(type)) : unknownOwnerDebugTask
          );
        };
      })();
    }
  });

  // node_modules/react/jsx-runtime.js
  var require_jsx_runtime = __commonJS({
    "node_modules/react/jsx-runtime.js"(exports, module) {
      "use strict";
      if (false) {
        module.exports = null;
      } else {
        module.exports = require_react_jsx_runtime_development();
      }
    }
  });

  // lib/catalog.ts
  var LOW = 0;
  var MEDIUM = 1;
  var HIGH = 2;
  var levels = (low, medium, high) => [
    { value: LOW, label: "Low", description: low },
    { value: MEDIUM, label: "Medium", description: medium },
    { value: HIGH, label: "High", description: high }
  ];
  var criterion = (id, label, shared, low, medium, high) => ({
    id,
    label,
    shared,
    levels: levels(low, medium, high)
  });
  var COMPLEXITY = criterion(
    "complexity",
    "Complexity",
    true,
    "A simple formal organization with few geometric elements, limited variation, and a clear overall configuration.",
    "A moderately varied formal organization with multiple geometric elements or relationships, while maintaining a recognizable overall configuration.",
    "A highly varied formal organization with numerous geometric elements, transformations, intersections, or layered relationships that produce a complex configuration."
  );
  var PROPORTIONALITY = criterion(
    "proportionality",
    "Proportionality",
    true,
    "Spaces and elements have relatively uniform dimensions and proportions, with limited variation between their size relationships.",
    "Spaces and elements have noticeable variations in dimension and proportion, creating multiple but relatively balanced relationships.",
    "Spaces and elements have strongly differentiated dimensions and proportions, creating deliberate relationships between contrasting scales and spatial dimensions."
  );
  var OPENNESS = criterion(
    "openness",
    "Openness",
    true,
    "The space is predominantly enclosed, with limited openings and restricted visual or physical access to adjacent spaces.",
    "The space combines enclosed and open conditions, providing moderate visual and physical access to adjacent spaces.",
    "The space is predominantly open, with extensive visual and physical access to surrounding spaces and limited enclosure."
  );
  var CONNECTIVITY = criterion(
    "connectivity",
    "Connectivity",
    true,
    "The space has few direct relationships with adjacent spaces, with limited movement, visibility, or interaction between them.",
    "The space has multiple relationships with adjacent spaces, providing moderate opportunities for movement, visibility, or interaction.",
    "The space is highly interconnected, with numerous direct relationships to surrounding spaces through movement, visibility, and spatial overlap."
  );
  var IMMERSIVE = criterion(
    "immersive",
    "Immersive",
    true,
    "The atmosphere is minimally immersive. Sensory conditions remain neutral, predictable, and visually or spatially detached, allowing the user to remain primarily aware of the surrounding environment rather than the atmospheric experience.",
    "The atmosphere is moderately immersive. Sensory qualities such as light, material, sound, scale, and enclosure begin to shape the user\u2019s perception and encourage a stronger awareness of the space.",
    "The atmosphere is deeply immersive. Multiple sensory and spatial qualities are deliberately integrated to envelop the user, intensify perception, and create a strong sense of being absorbed within the environment."
  );
  var VISIBILITY = criterion(
    "visibility",
    "Visibility",
    true,
    "Visual access is limited, with frequent interruptions to sightlines between spaces or areas.",
    "Visual access is moderate, combining open sightlines with areas of visual obstruction or interruption.",
    "Visual access is extensive, with long sightlines and minimal obstruction between spaces or areas."
  );
  var CENTRALITY = criterion(
    "centrality",
    "Centrality",
    false,
    "The lobby occupies a peripheral or secondary position and has limited influence on access to surrounding spaces.",
    "The lobby occupies a partially central position and provides access to or organizes several surrounding spaces.",
    "The lobby occupies a central position and functions as a primary spatial node from which multiple surrounding spaces are accessed or organized."
  );
  var PLATE_ARTICULATION = criterion(
    "plate-articulation",
    "Plate Articulation",
    false,
    "The workspace plate is predominantly continuous and uniform, with minimal changes in its geometric configuration.",
    "The workspace plate contains noticeable shifts, divisions, offsets, or variations that create distinct spatial zones.",
    "The workspace plate is strongly articulated through significant shifts, projections, recesses, rotations, or subdivisions that actively define the spatial organization."
  );
  var CIRCULATION_INTEGRATION = criterion(
    "circulation-integration",
    "Circulation Integration",
    false,
    "Circulation is primarily separated from the gathering area, occurring around or outside the space.",
    "Circulation partially overlaps or passes through the gathering area, creating some interaction between movement and occupation.",
    "Circulation is embedded within the gathering area, with movement paths actively shaping, connecting, or activating gathering zones."
  );
  var DIRECTIONALITY = criterion(
    "directionality",
    "Directionality",
    false,
    "No dominant directional axis is established. Movement and visual orientation are distributed across multiple directions.",
    "A discernible primary direction organizes movement or visual orientation, while secondary directions remain present.",
    "A strong directional axis clearly organizes movement, orientation, and visual focus through the lobby."
  );
  var MODULARITY = criterion(
    "modularity",
    "Modularity",
    false,
    "The workspace is primarily continuous or fixed, with limited repetition, subdivision, or ability to reorganize spatial units.",
    "The workspace is organized through identifiable repeated or divisible units, allowing some degree of spatial flexibility.",
    "The workspace is strongly organized through repeated, interchangeable, or reconfigurable units that allow multiple spatial configurations."
  );
  var SPATIAL_PERMANENCE = criterion(
    "spatial-permanence",
    "Spatial Permanence",
    false,
    "Gathering is isolated from the circulation paths. It exists wholly on its own.",
    "Gathering and circulation are parallel to each other but do not co-exist.",
    "Circulation is within the gathering space. Gathering happens because of circulation."
  );
  var RECEPTIVITY = criterion(
    "receptivity",
    "Receptivity",
    false,
    "The lobby conveys a limited sense of invitation. The space feels formal, guarded, or psychologically distant, discouraging entry or prolonged occupation.",
    "The lobby conveys a moderate sense of invitation. The space feels accessible and comfortable, while maintaining a degree of formality or control.",
    "The lobby conveys a strong sense of invitation. The space feels welcoming, comfortable, and accessible, encouraging entry, interaction, and occupation."
  );
  var COLLABORATION = criterion(
    "collaboration",
    "Collaboration",
    false,
    "The workspace is primarily configured for individual occupation, with limited spatial proximity or opportunities for interaction.",
    "The workspace combines individual and shared areas, providing moderate opportunities for interaction and collaborative activity.",
    "The workspace is strongly configured around shared areas, proximity, visual interaction, and spatial conditions that support collaborative activity."
  );
  var SOCIAL_PROXIMITY = criterion(
    "social-proximity",
    "Social Proximity",
    false,
    "Gathering space offers multiple paths or big spaces with things like foliage or tables to separate the experience between people, which makes this a very low stimulating experience and more private.",
    "Gathering space offers some private/open spaces to relax in but is part of a series of identical spaces that are close together.",
    "The gathering space offers very compressed paths or open spaces. Therefore, if a high amount of people circulate the space, it would be a highly overstimulating experience."
  );
  var BRANCHES = [
    {
      id: "formal",
      title: "Formal",
      subtitle: "Geometry / Massing / Organization",
      shared: [COMPLEXITY, PROPORTIONALITY],
      specific: {
        lobby: CENTRALITY,
        workspace: PLATE_ARTICULATION,
        gathering: CIRCULATION_INTEGRATION
      }
    },
    {
      id: "spatial",
      title: "Spatial",
      subtitle: "Space / Connections / Experience",
      shared: [OPENNESS, CONNECTIVITY],
      specific: {
        lobby: DIRECTIONALITY,
        workspace: MODULARITY,
        gathering: SPATIAL_PERMANENCE
      }
    },
    {
      id: "atmospheric",
      title: "Atmospheric",
      subtitle: "Light / Sensory / Environment",
      shared: [IMMERSIVE, VISIBILITY],
      specific: {
        lobby: RECEPTIVITY,
        workspace: COLLABORATION,
        gathering: SOCIAL_PROXIMITY
      }
    }
  ];
  var archetype = (id, name, ratings, descriptors) => ({ id, name, ratings, descriptors });
  var TYPOLOGIES = [
    {
      id: "lobby",
      label: "Lobby",
      definition: "A threshold between exterior and interior. A public arrival and transition space that receives people, orients, and distributes movement towards the rest of the building.",
      archetypes: [
        archetype(
          "vertical-void",
          "Vertical Void",
          {
            complexity: HIGH,
            proportionality: MEDIUM,
            centrality: HIGH,
            openness: HIGH,
            connectivity: MEDIUM,
            directionality: MEDIUM,
            immersive: HIGH,
            visibility: HIGH,
            receptivity: MEDIUM
          },
          {
            formal: "Dynamic Core",
            spatial: "Open Threshold",
            atmospheric: "Visual Immersion"
          }
        ),
        archetype(
          "compressed-sequential",
          "Compressed Sequential",
          {
            complexity: HIGH,
            proportionality: MEDIUM,
            centrality: LOW,
            openness: LOW,
            connectivity: MEDIUM,
            directionality: MEDIUM,
            immersive: HIGH,
            visibility: HIGH,
            receptivity: MEDIUM
          },
          {
            formal: "Geometry Compression",
            spatial: "Sequential Release",
            atmospheric: "Immersive Transition"
          }
        ),
        archetype(
          "continuous-hall",
          "Continuous Hall",
          {
            complexity: HIGH,
            proportionality: LOW,
            centrality: HIGH,
            openness: HIGH,
            connectivity: HIGH,
            directionality: HIGH,
            immersive: HIGH,
            visibility: MEDIUM,
            receptivity: HIGH
          },
          {
            formal: "Radial Convergence",
            spatial: "Integrated Form",
            atmospheric: "Dynamic Engagement"
          }
        ),
        archetype(
          "topographic-ground-field",
          "Topographic Ground Field",
          {
            complexity: HIGH,
            proportionality: HIGH,
            centrality: LOW,
            openness: HIGH,
            connectivity: HIGH,
            directionality: MEDIUM,
            immersive: HIGH,
            visibility: HIGH,
            receptivity: HIGH
          },
          {
            formal: "Sculpted Ground",
            spatial: "Distributed Flow",
            atmospheric: "Shared Engagement"
          }
        ),
        archetype(
          "linear-gallery",
          "Linear Gallery",
          {
            complexity: HIGH,
            proportionality: MEDIUM,
            centrality: HIGH,
            openness: MEDIUM,
            connectivity: HIGH,
            directionality: HIGH,
            immersive: MEDIUM,
            visibility: MEDIUM,
            receptivity: MEDIUM
          },
          {
            formal: "Linear Fragmentation",
            spatial: "Connected Progression",
            atmospheric: "Intuitive Guidance"
          }
        )
      ]
    },
    {
      id: "workspace",
      label: "Workspace",
      definition: "A workspace is a space designed to support work and productivity, accommodating different ways of working, from individual to shared activities.",
      archetypes: [
        archetype(
          "open-hall",
          "Open Hall",
          {
            complexity: MEDIUM,
            proportionality: MEDIUM,
            "plate-articulation": LOW,
            openness: HIGH,
            connectivity: MEDIUM,
            modularity: HIGH,
            immersive: MEDIUM,
            visibility: HIGH,
            collaboration: MEDIUM
          },
          {
            formal: "Orthogonal Balance",
            spatial: "Adaptive Module",
            atmospheric: "Engaging"
          }
        ),
        archetype(
          "terraced",
          "Terraced",
          {
            complexity: MEDIUM,
            proportionality: MEDIUM,
            "plate-articulation": HIGH,
            openness: HIGH,
            connectivity: HIGH,
            modularity: MEDIUM,
            immersive: HIGH,
            visibility: HIGH,
            collaboration: MEDIUM
          },
          {
            formal: "Articulated",
            spatial: "Connected Module",
            atmospheric: "Immersive"
          }
        ),
        archetype(
          "flat-deep-plan",
          "Flat Deep Plan",
          {
            complexity: LOW,
            proportionality: LOW,
            "plate-articulation": LOW,
            openness: MEDIUM,
            connectivity: LOW,
            modularity: HIGH,
            immersive: HIGH,
            visibility: LOW,
            collaboration: LOW
          },
          {
            formal: "Restrained",
            spatial: "Rigid Module",
            atmospheric: "Introspective"
          }
        ),
        archetype(
          "void-edge",
          "Void Edge",
          {
            complexity: MEDIUM,
            proportionality: MEDIUM,
            "plate-articulation": LOW,
            openness: MEDIUM,
            connectivity: MEDIUM,
            modularity: MEDIUM,
            immersive: HIGH,
            visibility: HIGH,
            collaboration: MEDIUM
          },
          {
            formal: "Radial Balance",
            spatial: "Integrated Module",
            atmospheric: "Partially Engaging"
          }
        ),
        archetype(
          "undulated",
          "Undulated",
          {
            complexity: HIGH,
            proportionality: MEDIUM,
            "plate-articulation": HIGH,
            openness: HIGH,
            connectivity: HIGH,
            modularity: LOW,
            immersive: HIGH,
            visibility: HIGH,
            collaboration: MEDIUM
          },
          {
            formal: "Dynamic",
            spatial: "Collective Modules",
            atmospheric: "Interactive"
          }
        )
      ]
    },
    {
      id: "gathering",
      label: "Gathering",
      definition: "A designed common space for employees to socialize, collaborate, and hold large events outside their individual desks.",
      archetypes: [
        archetype(
          "stepped-amphitheater",
          "Stepped Amphitheater",
          {
            complexity: LOW,
            proportionality: MEDIUM,
            "circulation-integration": HIGH,
            openness: LOW,
            connectivity: LOW,
            "spatial-permanence": HIGH,
            immersive: LOW,
            visibility: LOW,
            "social-proximity": MEDIUM
          },
          {
            formal: "Enclosed Threshold",
            spatial: "Incidental Threshold",
            atmospheric: "Contained Commons"
          }
        ),
        archetype(
          "void-field",
          "Void Field",
          {
            complexity: LOW,
            proportionality: LOW,
            "circulation-integration": MEDIUM,
            openness: HIGH,
            connectivity: LOW,
            "spatial-permanence": LOW,
            immersive: HIGH,
            visibility: HIGH,
            "social-proximity": LOW
          },
          {
            formal: "Visually Exposed Core",
            spatial: "Isolated Anchor",
            atmospheric: "Expansive Commons"
          }
        ),
        archetype(
          "inserted-horizontal-plate",
          "Inserted Horizontal Plate",
          {
            complexity: LOW,
            proportionality: LOW,
            "circulation-integration": HIGH,
            openness: HIGH,
            connectivity: HIGH,
            "spatial-permanence": HIGH,
            immersive: MEDIUM,
            visibility: HIGH,
            "social-proximity": LOW
          },
          {
            formal: "Modular Nodes",
            spatial: "Visually Disturbed Nodes",
            atmospheric: "Distributed Retreat"
          }
        ),
        archetype(
          "contained-room-within-volume",
          "Contained Room Within Volume",
          {
            complexity: HIGH,
            proportionality: HIGH,
            "circulation-integration": HIGH,
            openness: HIGH,
            connectivity: LOW,
            "spatial-permanence": HIGH,
            immersive: HIGH,
            visibility: HIGH,
            "social-proximity": HIGH
          },
          {
            formal: "Magnetic Enclosed Core",
            spatial: "Isolated Attractor",
            atmospheric: "Immersive Core"
          }
        ),
        archetype(
          "linear-edge-gallery",
          "Linear Edge Gallery",
          {
            complexity: LOW,
            proportionality: MEDIUM,
            "circulation-integration": MEDIUM,
            openness: MEDIUM,
            connectivity: LOW,
            "spatial-permanence": HIGH,
            immersive: MEDIUM,
            visibility: HIGH,
            "social-proximity": HIGH
          },
          {
            formal: "Porous Spine",
            spatial: "Integrated Nodes",
            atmospheric: "Social Commons"
          }
        )
      ]
    }
  ];
  function findTypology(id) {
    const found = TYPOLOGIES.find((item) => item.id === id);
    if (!found) throw new Error(`Unknown typology: ${id}`);
    return found;
  }
  function findArchetype(typology, archetypeId2) {
    return typology.archetypes.find((item) => item.id === archetypeId2) ?? typology.archetypes[0];
  }
  function groupsForArchetype(typologyId, archetype2, ratings) {
    return BRANCHES.map((branch) => {
      const definitions = [...branch.shared, branch.specific[typologyId]];
      const criteria = definitions.map((definition) => ({
        id: definition.id,
        label: definition.label,
        rating: ratings[definition.id] ?? archetype2.ratings[definition.id] ?? 1,
        definition
      }));
      return {
        id: branch.id,
        title: branch.title,
        subtitle: branch.subtitle,
        criteria,
        descriptor: archetype2.descriptors[branch.id]
      };
    });
  }
  function ratingDescription(definition, value) {
    return definition.levels[value].description;
  }

  // lib/physarum.ts
  function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
      t += 1831565813;
      let r = Math.imul(t ^ t >>> 15, 1 | t);
      r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
      return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
  }

  // lib/skill1/archetypes.ts
  var ARCHETYPES = {
    vertical_void: {
      id: "vertical-void",
      name: "Vertical Void",
      typologyId: "lobby",
      recipe: {
        sourceCorner: "bottom-left",
        attractor: { x: 10, y: 11 },
        attractors: [
          { kind: "ring", x: 10, y: 11, radius: 4.4, strength: 1.1, hole: true },
          { kind: "line", x: 2.2, y: 2.4, x2: 7.2, y2: 8.2, radius: 1.3, strength: 0.4 }
        ],
        coreExposure: 0.9,
        enclosureCollar: 0.85,
        isolationRadius: 4.3,
        clustering: 0.16,
        approachWidth: 3.3
      },
      topology: "around-absence"
    },
    compressed_sequential: {
      id: "compressed-sequential",
      name: "Compressed Sequential",
      typologyId: "lobby",
      recipe: {
        sourceCorner: "bottom-left",
        attractor: { x: 10, y: 10 },
        attractors: [
          { kind: "point", x: 2.2, y: 4, radius: 2.4, strength: 0.85 },
          { kind: "point", x: 2.2, y: 10, radius: 2.2, strength: 0.7 },
          { kind: "point", x: 2.2, y: 16, radius: 2.4, strength: 0.85 },
          { kind: "ring", x: 6.2, y: 10, radius: 1.35, strength: 1.15, hole: true },
          { kind: "ring", x: 9.2, y: 10, radius: 0.78, strength: 1.2, hole: true },
          { kind: "ring", x: 12, y: 10, radius: 0.78, strength: 1.2, hole: true },
          { kind: "ring", x: 14.6, y: 10, radius: 1.35, strength: 1.15, hole: true },
          { kind: "point", x: 17.8, y: 4, radius: 2.4, strength: 0.85 },
          { kind: "point", x: 17.8, y: 10, radius: 2.2, strength: 0.7 },
          { kind: "point", x: 17.8, y: 16, radius: 2.4, strength: 0.85 }
        ],
        coreExposure: 0.38,
        enclosureCollar: 1.7,
        isolationRadius: 2.6,
        clustering: 0.64,
        approachWidth: 1.35
      },
      topology: "open-network"
    },
    continuous_hall: {
      id: "continuous-hall",
      name: "Continuous Hall",
      typologyId: "lobby",
      recipe: {
        sourceCorner: "bottom-left",
        attractor: { x: 10, y: 10 },
        attractors: [
          { kind: "line", x: 2.5, y: 10, x2: 17.5, y2: 10, radius: 1.8, strength: 1 },
          { kind: "point", x: 5, y: 10, radius: 2.2, strength: 0.45 },
          { kind: "point", x: 15, y: 10, radius: 2.2, strength: 0.45 }
        ],
        coreExposure: 0.8,
        enclosureCollar: 1.15,
        isolationRadius: 5.4,
        clustering: 0.26,
        approachWidth: 4.2
      },
      topology: "open-network"
    },
    topographic_ground_field: {
      id: "topographic-ground-field",
      name: "Topographic Ground Field",
      typologyId: "lobby",
      recipe: {
        sourceCorner: "bottom-left",
        attractor: { x: 10, y: 9 },
        attractors: [
          { kind: "point", x: 5, y: 6, radius: 3.4, strength: 0.4 },
          { kind: "point", x: 12, y: 8, radius: 3.6, strength: 0.45 },
          { kind: "point", x: 8, y: 14, radius: 3.2, strength: 0.35 },
          { kind: "point", x: 15, y: 13, radius: 2.8, strength: 0.35 }
        ],
        coreExposure: 0.92,
        enclosureCollar: 0.55,
        isolationRadius: 6.5,
        clustering: 0.08,
        approachWidth: 4.7
      },
      topology: "open-network"
    },
    linear_gallery: {
      id: "linear-gallery",
      name: "Linear Gallery",
      typologyId: "lobby",
      recipe: {
        sourceCorner: "bottom-left",
        attractor: { x: 14, y: 10 },
        attractors: [
          { kind: "line", x: 3, y: 10, x2: 17, y2: 10, radius: 1.15, strength: 1 },
          { kind: "point", x: 6, y: 10, radius: 1.3, strength: 0.7 },
          { kind: "point", x: 11, y: 10, radius: 1.3, strength: 0.7 },
          { kind: "point", x: 15.5, y: 10, radius: 1.4, strength: 0.8 }
        ],
        coreExposure: 0.52,
        enclosureCollar: 1.05,
        isolationRadius: 3.1,
        clustering: 0.44,
        approachWidth: 2.15
      },
      topology: "open-network"
    },
    open_hall: {
      id: "open-hall",
      name: "Open Hall",
      typologyId: "workspace",
      recipe: {
        sourceCorner: "bottom-left",
        attractor: { x: 10, y: 10 },
        attractors: [
          { kind: "point", x: 10, y: 10, radius: 5.5, strength: 0.45 },
          { kind: "point", x: 10, y: 10, radius: 2, strength: 0.85 },
          { kind: "ring", x: 10, y: 10, radius: 6.2, strength: 0.25 }
        ],
        coreExposure: 0.84,
        enclosureCollar: 1,
        isolationRadius: 5.6,
        clustering: 0.2,
        approachWidth: 3.85
      },
      topology: "open-network"
    },
    terraced: {
      id: "terraced",
      name: "Terraced",
      typologyId: "workspace",
      recipe: {
        sourceCorner: "bottom-left",
        attractor: { x: 10, y: 13 },
        attractors: [
          { kind: "line", x: 3, y: 6, x2: 17, y2: 6, radius: 1.1, strength: 0.7 },
          { kind: "line", x: 4, y: 10, x2: 16, y2: 10, radius: 1.15, strength: 0.9 },
          { kind: "line", x: 5, y: 14, x2: 15, y2: 14, radius: 1.2, strength: 1 },
          { kind: "point", x: 10, y: 14, radius: 1.6, strength: 0.5 }
        ],
        coreExposure: 0.68,
        enclosureCollar: 1.85,
        isolationRadius: 4.35,
        clustering: 0.5,
        approachWidth: 2.95
      },
      topology: "open-network"
    },
    flat_deep_plan: {
      id: "flat-deep-plan",
      name: "Flat Deep Plan",
      typologyId: "workspace",
      recipe: {
        sourceCorner: "bottom-right",
        attractor: { x: 10, y: 10 },
        attractors: [
          { kind: "point", x: 9, y: 9, radius: 1.5, strength: 1 },
          { kind: "point", x: 11.5, y: 10.5, radius: 1.4, strength: 0.9 },
          { kind: "point", x: 10, y: 12, radius: 1.3, strength: 0.75 },
          { kind: "ring", x: 10, y: 10, radius: 3.4, strength: 0.35 }
        ],
        coreExposure: 0.26,
        enclosureCollar: 3.7,
        isolationRadius: 2.35,
        clustering: 0.8,
        approachWidth: 1.35
      },
      topology: "contained-interior"
    },
    void_edge: {
      id: "void-edge",
      name: "Void Edge",
      typologyId: "workspace",
      recipe: {
        sourceCorner: "bottom-left",
        attractor: { x: 15.6, y: 10 },
        attractors: [
          { kind: "ring", x: 15.6, y: 10, radius: 3.6, strength: 1 },
          { kind: "line", x: 16.5, y: 3, x2: 16.5, y2: 17, radius: 1.2, strength: 0.55 },
          { kind: "point", x: 8, y: 10, radius: 2, strength: 0.4 }
        ],
        coreExposure: 0.72,
        enclosureCollar: 1.15,
        isolationRadius: 3.7,
        clustering: 0.2,
        approachWidth: 2.75
      },
      topology: "around-absence"
    },
    undulated: {
      id: "undulated",
      name: "Undulated",
      typologyId: "workspace",
      recipe: {
        sourceCorner: "bottom-left",
        attractor: { x: 10, y: 10 },
        attractors: [
          { kind: "point", x: 4, y: 7, radius: 1.8, strength: 0.7 },
          { kind: "point", x: 8, y: 12, radius: 1.8, strength: 0.8 },
          { kind: "point", x: 12, y: 7.5, radius: 1.8, strength: 0.8 },
          { kind: "point", x: 16, y: 12.5, radius: 1.8, strength: 0.7 },
          { kind: "line", x: 3, y: 8, x2: 17, y2: 11, radius: 1.4, strength: 0.35 }
        ],
        coreExposure: 0.76,
        enclosureCollar: 1.45,
        isolationRadius: 4.7,
        clustering: 0.34,
        approachWidth: 3.25
      },
      topology: "open-network"
    },
    stepped_amphitheater: {
      id: "stepped-amphitheater",
      name: "Stepped Amphitheater",
      typologyId: "gathering",
      recipe: {
        sourceCorner: "bottom-left",
        attractor: { x: 10, y: 10.4 },
        attractorsOnly: true,
        attractors: [
          { kind: "ring", x: 10, y: 10.4, radius: 1.6, strength: 0.85, hole: true },
          { kind: "curve", x: 6.6, y: 10.4, x2: 13.4, y2: 10.4, cx: 10, cy: 6.9, radius: 0.55, strength: 1.22 },
          { kind: "curve", x: 6.6, y: 10.4, x2: 13.4, y2: 10.4, cx: 10, cy: 13.9, radius: 0.55, strength: 1.22 },
          { kind: "curve", x: 5, y: 10.4, x2: 15, y2: 10.4, cx: 10, cy: 5.4, radius: 0.6, strength: 1.12 },
          { kind: "curve", x: 5, y: 10.4, x2: 15, y2: 10.4, cx: 10, cy: 15.4, radius: 0.6, strength: 1.12 },
          { kind: "curve", x: 3.4, y: 10.4, x2: 16.6, y2: 10.4, cx: 10, cy: 3.8, radius: 0.65, strength: 1.02 },
          { kind: "curve", x: 3.4, y: 10.4, x2: 16.6, y2: 10.4, cx: 10, cy: 17, radius: 0.65, strength: 1.02 },
          { kind: "point", x: 6.2, y: 4.2, radius: 0.9, strength: 0.32 },
          { kind: "point", x: 13.8, y: 4.2, radius: 0.9, strength: 0.32 }
        ],
        coreExposure: 0.24,
        enclosureCollar: 3.55,
        isolationRadius: 2.55,
        clustering: 0.82,
        approachWidth: 1.65
      },
      topology: "around-absence"
    },
    void_field: {
      id: "void-field",
      name: "Void Field",
      typologyId: "gathering",
      recipe: {
        sourceCorner: "bottom-left",
        attractor: { x: 10, y: 11 },
        attractors: [
          { kind: "ring", x: 10, y: 11, radius: 4.8, strength: 1 },
          { kind: "point", x: 4, y: 5, radius: 2.4, strength: 0.35 },
          { kind: "point", x: 16, y: 6, radius: 2.4, strength: 0.35 },
          { kind: "point", x: 10, y: 17, radius: 2.2, strength: 0.3 }
        ],
        coreExposure: 0.92,
        enclosureCollar: 0.8,
        isolationRadius: 4.6,
        clustering: 0.12,
        approachWidth: 3.4
      },
      topology: "around-absence"
    },
    inserted_horizontal_plate: {
      id: "inserted-horizontal-plate",
      name: "Inserted Horizontal Plate",
      typologyId: "gathering",
      recipe: {
        sourceCorner: "bottom-left",
        attractor: { x: 10, y: 10 },
        attractors: [
          { kind: "line", x: 2, y: 10, x2: 18, y2: 10, radius: 1.35, strength: 1.15 },
          { kind: "point", x: 10, y: 10, radius: 2.4, strength: 0.4 },
          { kind: "point", x: 10, y: 4.5, radius: 2.6, strength: 0.25 },
          { kind: "point", x: 10, y: 15.5, radius: 2.6, strength: 0.25 }
        ],
        coreExposure: 0.86,
        enclosureCollar: 0.7,
        isolationRadius: 5.9,
        clustering: 0.14,
        approachWidth: 3.7
      },
      topology: "open-network"
    },
    contained_room_within_volume: {
      id: "contained-room-within-volume",
      name: "Contained Room Within Volume",
      typologyId: "gathering",
      recipe: {
        sourceCorner: "bottom-right",
        attractor: { x: 10, y: 10 },
        attractors: [
          { kind: "point", x: 9.2, y: 9.4, radius: 1.3, strength: 1 },
          { kind: "point", x: 11.2, y: 10.6, radius: 1.25, strength: 0.9 },
          { kind: "ring", x: 10, y: 10, radius: 3.1, strength: 0.55 }
        ],
        coreExposure: 0.34,
        enclosureCollar: 3.4,
        isolationRadius: 2.1,
        clustering: 0.86,
        approachWidth: 1.55
      },
      topology: "contained-interior"
    },
    linear_edge_gallery: {
      id: "linear-edge-gallery",
      name: "Linear Edge Gallery",
      typologyId: "gathering",
      recipe: {
        sourceCorner: "bottom-left",
        attractor: { x: 16, y: 10 },
        attractors: [
          { kind: "line", x: 16.2, y: 3, x2: 16.2, y2: 17, radius: 1.15, strength: 1 },
          { kind: "point", x: 16.2, y: 6, radius: 1.3, strength: 0.7 },
          { kind: "point", x: 16.2, y: 11, radius: 1.3, strength: 0.75 },
          { kind: "point", x: 16.2, y: 15, radius: 1.3, strength: 0.7 }
        ],
        coreExposure: 0.48,
        enclosureCollar: 1.35,
        isolationRadius: 2.75,
        clustering: 0.56,
        approachWidth: 1.8
      },
      topology: "open-network"
    }
  };
  function configForArchetype(archetypeId2) {
    const found = Object.values(ARCHETYPES).find((item) => item.id === archetypeId2);
    if (!found) {
      throw new Error(`Unknown archetype: ${archetypeId2}`);
    }
    return found;
  }

  // lib/skill1/maps.ts
  var RATING_LABEL = ["Low", "Medium", "High"];
  var INTENSITY_MAP = {
    0: 0.2,
    1: 0.5,
    2: 0.8
  };
  var RADIUS_MAP = {
    0: 3,
    1: 6,
    2: 10
  };
  var DIRECTIONALITY_MAP = {
    0: 0,
    1: 0.5,
    2: 1
  };
  var SOCIAL_PROXIMITY_SPACING_MAP = {
    0: 0.8,
    1: 0.5,
    2: 0.2
  };
  var GAMMA_MEDIUM = 0.5;
  var DECAY_PRESETS = {
    controlled: 0.042,
    aggressive: 0.09
  };
  var RANDOMNESS_PRESETS = {
    low: 0.04,
    medium: 0.1,
    high: 0.22
  };
  var FIELD_SIZE = 20;
  var TRAIL_SCALE = 64;
  var PATH_LENGTH = 80;
  var DEFAULT_AGENT_COUNT = 1e3;
  var DISPLAY_ITERATIONS = 600;
  var MIN_AGENT_COUNT = 1;
  var MAX_AGENT_COUNT = 2e3;
  var MIN_DENSITY = 1;
  var MAX_DENSITY = 10;
  var MAX_ITERATIONS = 1e3;
  var CONVERGENCE_EPSILON = 0.012;
  var CONVERGENCE_STREAK = 24;
  var CONVERGENCE_MIN_ITERATIONS = 420;
  function densityAmount(density) {
    return Math.min(1, Math.max(0, (density - MIN_DENSITY) / (MAX_DENSITY - MIN_DENSITY)));
  }
  function trailMaskCutoff(density) {
    return 0.38 - densityAmount(density) * 0.24;
  }
  function asRatingIndex(value) {
    if (value <= 0) return 0;
    if (value >= 2) return 2;
    return 1;
  }

  // lib/skill1/translate.ts
  var intensity = (rating, fallback = 1) => INTENSITY_MAP[asRatingIndex(rating ?? fallback)];
  var GROUPS = ["formal", "spatial", "atmospheric"];
  var CRITERION_TARGETS = {
    complexity: { target: "geometryVariation", label: "environmental variation" },
    proportionality: { target: "scaleVariation", label: "spatial scale variation" },
    centrality: { target: "attractorPosition", label: "attractor location" },
    "plate-articulation": {
      target: "geometricDisplacement",
      label: "geometric displacement"
    },
    "circulation-integration": {
      target: "flowCoupling",
      label: "how strongly movement writes trails"
    },
    openness: { target: "permeability", label: "how freely agents move" },
    connectivity: { target: "networkDensity", label: "how strongly agents link areas" },
    directionality: { target: "directionalBias", label: "preferred movement direction" },
    modularity: { target: "nodeRepetition", label: "node repetition" },
    "spatial-permanence": {
      target: "persistence",
      label: "trail persistence"
    },
    immersive: { target: "attractionStrength", label: "strength of attraction" },
    visibility: { target: "influenceRadius", label: "how far attraction reaches" },
    receptivity: { target: "sourcePermeability", label: "source permeability" },
    collaboration: { target: "nodeInteraction", label: "node interaction strength" },
    "social-proximity": { target: "nodeSpacing", label: "how closely agents concentrate" }
  };
  var CRITERION_REASONS = {
    complexity: "Complexity sets how much agents wander and vary their heading.",
    proportionality: "Proportionality stretches how wide or peaked the attraction field is.",
    centrality: "Centrality places the attractor between the source and the field center.",
    "plate-articulation": "Plate articulation offsets local geometry so repeated units are not identical.",
    "circulation-integration": "Circulation integration sets how strongly movement writes trails into the field.",
    openness: "Openness sets how freely agents can move through the field.",
    connectivity: "Connectivity sets how strongly agents follow and join trails between areas.",
    directionality: "Directionality sets whether agents prefer a heading toward the attractor.",
    modularity: "Modularity repeats similar nodes so the network can subdivide without a new attractor.",
    "spatial-permanence": "Persistence lowers decay on occupied cells near the attractor so reinforced routes remain without deleting secondary paths.",
    immersive: "Immersion sets how strongly the attractor pulls agents.",
    visibility: "Visibility sets how far the attractor can influence agents.",
    receptivity: "Receptivity sets how easily agents leave the source into the field.",
    collaboration: "Collaboration sets how strongly nearby agents influence each other.",
    "social-proximity": "Higher social proximity packs agents closer; lower proximity lets them spread."
  };
  function paramValue(params, target) {
    if (target === "attractorPosition") return 0;
    const value = params[target];
    return typeof value === "number" ? value : 0;
  }
  function intensityLabel(value) {
    if (value >= 0.66) return "High";
    if (value >= 0.4) return "Medium";
    return "Low";
  }
  function ratingOf(ratings, id, fallback = 1) {
    const value = ratings[id];
    return value === 0 || value === 1 || value === 2 ? value : fallback;
  }
  function paramsFromRatings(ratings) {
    const complexity = ratingOf(ratings, "complexity", 0);
    const proportionality = ratingOf(ratings, "proportionality", 0);
    const circulation = ratingOf(ratings, "circulation-integration", 1);
    const openness = ratingOf(ratings, "openness", 2);
    const connectivity = ratingOf(ratings, "connectivity", 0);
    const permanence = ratingOf(ratings, "spatial-permanence", 0);
    const immersive = ratingOf(ratings, "immersive", 2);
    const visibility = ratingOf(ratings, "visibility", 2);
    const proximity = ratingOf(ratings, "social-proximity", 0);
    const directionality = ratingOf(ratings, "directionality", 0);
    const plate = ratingOf(ratings, "plate-articulation", 1);
    const modularity = ratingOf(ratings, "modularity", 1);
    const receptivity = ratingOf(ratings, "receptivity", 1);
    const collaboration = ratingOf(ratings, "collaboration", 1);
    return {
      geometryVariation: intensity(complexity),
      scaleVariation: intensity(proportionality),
      flowCoupling: intensity(circulation),
      permeability: intensity(openness),
      networkDensity: intensity(connectivity),
      directionalBias: DIRECTIONALITY_MAP[directionality],
      attractionStrength: intensity(immersive),
      influenceRadius: RADIUS_MAP[visibility],
      nodeSpacing: SOCIAL_PROXIMITY_SPACING_MAP[proximity],
      persistence: intensity(permanence),
      sourcePermeability: intensity(receptivity),
      nodeInteraction: intensity(collaboration),
      geometricDisplacement: intensity(plate),
      nodeRepetition: intensity(modularity),
      gamma: GAMMA_MEDIUM,
      decay: DECAY_PRESETS.controlled,
      decayMode: "controlled",
      randomness: RANDOMNESS_PRESETS.medium,
      randomnessMode: "medium"
    };
  }
  function buildBehavior(params) {
    const trailFollow = 0.48 + params.networkDensity * 0.85;
    return {
      exploration: intensityLabel(params.permeability),
      attraction: intensityLabel(params.attractionStrength),
      trailFollowing: trailFollow >= 0.45 ? "High" : intensityLabel(trailFollow),
      reinforcement: intensityLabel(params.flowCoupling),
      decay: params.decayMode,
      randomness: params.randomnessMode
    };
  }
  function buildRankings(traces, descriptors) {
    return traces.filter(
      (trace) => GROUPS.includes(trace.category)
    ).map((trace) => {
      const ranks = Object.fromEntries(
        GROUPS.map((category) => {
          const belongs = trace.category === category;
          const rank = {
            category,
            descriptor: descriptors[category],
            belongs,
            rating: belongs ? trace.rating : null,
            ratingLabel: belongs ? trace.ratingLabel : null
          };
          return [category, rank];
        })
      );
      return {
        criterionId: trace.criterionId,
        criterion: trace.criterion,
        category: trace.category,
        rating: trace.rating,
        ratingLabel: trace.ratingLabel,
        ratingDescription: trace.ratingDescription,
        descriptor: trace.descriptor ?? descriptors[trace.category],
        ranks,
        target: trace.target,
        biologicalLabel: trace.biologicalLabel,
        biologicalValue: trace.biologicalValue,
        reason: trace.reason
      };
    });
  }
  function translateArchetype(archetypeId2) {
    const config = configForArchetype(archetypeId2);
    const typology = findTypology(config.typologyId);
    const archetype2 = findArchetype(typology, config.id);
    const ratings = { ...archetype2.ratings };
    const params = paramsFromRatings(ratings);
    const descriptors = archetype2.descriptors;
    const groups = groupsForArchetype(config.typologyId, archetype2, ratings);
    const traces = groups.flatMap(
      (group) => group.criteria.map((criterion2) => {
        const mapping = CRITERION_TARGETS[criterion2.id] ?? {
          target: "geometryVariation",
          label: "agent behavior"
        };
        return {
          criterionId: criterion2.id,
          criterion: criterion2.label,
          category: group.id,
          rating: criterion2.rating,
          ratingLabel: RATING_LABEL[criterion2.rating],
          ratingDescription: ratingDescription(criterion2.definition, criterion2.rating),
          descriptor: group.descriptor,
          target: mapping.target,
          biologicalLabel: mapping.label,
          biologicalValue: paramValue(params, mapping.target),
          reason: CRITERION_REASONS[criterion2.id] ?? `${criterion2.label} at ${RATING_LABEL[criterion2.rating]} sets ${mapping.label} for ${group.descriptor}.`
        };
      })
    );
    return {
      archetypeId: config.id,
      archetypeName: config.name,
      typologyId: config.typologyId,
      topology: config.topology,
      descriptors,
      ratings,
      params,
      recipe: config.recipe,
      traces,
      rankings: buildRankings(traces, descriptors),
      behavior: buildBehavior(params)
    };
  }
  function sourceFromCorner(corner, size) {
    const inset = 1;
    if (corner === "bottom-right") return { x: size - 1 - inset, y: inset };
    return { x: inset, y: inset };
  }
  function attractorFromRatings(translation, size) {
    const rating = translation.ratings.centrality;
    if (rating !== 0 && rating !== 1 && rating !== 2) {
      return { ...translation.recipe.attractor };
    }
    const source = sourceFromCorner(translation.recipe.sourceCorner, size);
    const center = { x: (size - 1) / 2, y: (size - 1) / 2 };
    const t = 0.28 + rating * 0.36;
    return {
      x: source.x + (center.x - source.x) * t,
      y: source.y + (center.y - source.y) * t
    };
  }

  // lib/skill1/run-stepped-amphitheater.ts
  var CENTER = (FIELD_SIZE - 1) / 2;
  var TWO_PI = Math.PI * 2;
  var wrap = (angle) => {
    let next = angle % TWO_PI;
    if (next < 0) next += TWO_PI;
    return next;
  };
  var delta = (to, from) => {
    let d = wrap(to) - wrap(from);
    if (d > Math.PI) d -= TWO_PI;
    if (d < -Math.PI) d += TWO_PI;
    return d;
  };
  var mix = (from, to, t) => wrap(from + delta(to, from) * t);
  function halton(index2, base2) {
    let f = 1;
    let r = 0;
    let n = index2 + 1;
    while (n > 0) {
      f /= base2;
      r += f * (n % base2);
      n = Math.floor(n / base2);
    }
    return r;
  }
  function sample(index2, seed, attempt, base2) {
    const jitter = mulberry32((seed ^ index2 * 2654435769 ^ attempt * 2246822507 ^ base2 * 668265261) >>> 0)();
    return Math.min(0.999, Math.max(0, halton(index2, base2) * 0.84 + jitter * 0.16));
  }
  function planSteppedAmphitheater(seed, attempt = 0, index2 = 0) {
    const h = (base2) => sample(index2, seed, attempt, base2);
    const span0 = 4.4 + h(2) * 5.4;
    const pitch = 1.05 + h(3) * 1.25;
    const count = 3 + Math.floor(h(5) * 6);
    const gatherU = 1.15 + h(7) * 2.6;
    const gatherV = 1.05 + h(11) * 2.4;
    const curve = (h(13) - 0.48) * 2.4;
    const asymmetry = (h(17) - 0.5) * 1.35;
    const flare2 = (h(19) - 0.5) * 1.1;
    const entryV = -(1.7 + h(23) * 3.6);
    const entryU = (h(29) - 0.5) * span0 * 0.95;
    const axis = h(31) * TWO_PI;
    const phase = h(37) * TWO_PI;
    const locals = [
      [entryU, entryV],
      [0, 0],
      [-gatherU, gatherV * 0.5],
      [gatherU * (1 + Math.max(0, asymmetry)), gatherV],
      [0, gatherV + pitch * count],
      [-span0, gatherV + pitch * count * 0.45],
      [span0 * (1 + Math.max(0, asymmetry)), gatherV + pitch * count * 0.7]
    ];
    let minU = 99;
    let maxU = -99;
    let minV = 99;
    let maxV = -99;
    for (const [u, v] of locals) {
      const vLin = v - curve * 0.42 * u * u / Math.max(2.5, span0);
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, vLin);
      maxV = Math.max(maxV, vLin);
    }
    const scale = 15.2 / Math.max(maxU - minU, maxV - minV, 1);
    const ox = (h(41) - 0.5) * 1.4;
    const oy = (h(43) - 0.5) * 1.4;
    const cu = (minU + maxU) / 2;
    const cv3 = (minV + maxV) / 2;
    const c = Math.cos(axis);
    const s = Math.sin(axis);
    const ou = -cu * scale;
    const ov = -cv3 * scale;
    const gx = CENTER + ox - ou * s + ov * c;
    const gy = CENTER + oy + ou * c + ov * s;
    const entryLin = entryV - curve * 0.42 * entryU * entryU / Math.max(2.5, span0);
    const eu = entryU * scale;
    const ev = entryLin * scale;
    return {
      gx,
      gy,
      ex: gx - eu * s + ev * c,
      ey: gy + eu * c + ev * s,
      axis,
      curve,
      pitch: pitch * scale,
      count,
      span: span0 * scale,
      asymmetry,
      branch: h(47),
      branchAngle: 0.35 + h(53) * 1.35,
      gatherU: gatherU * scale,
      gatherV: gatherV * scale,
      throat: (0.42 + h(59) * 1.15) * scale,
      porosity: 0.12 + h(61) * 0.55,
      enclosure: h(67),
      phase,
      flare: flare2
    };
  }
  function attractorsFromSteppedAmphitheater(_plan) {
    return [];
  }
  function frameOf(x, y, field) {
    const dx = x - field.gx;
    const dy = y - field.gy;
    const c = Math.cos(field.axis);
    const s = Math.sin(field.axis);
    const u = dx * -s + dy * c;
    const vLin = dx * c + dy * s;
    const span4 = Math.max(2.5, field.span);
    const dvu = 2 * field.curve * 0.42 * u / span4;
    const dvv = 1 + Math.cos(vLin * 0.85 + field.phase) * field.pitch * 0.22 * 0.85;
    const v = vLin + field.curve * 0.42 * u * u / span4 + Math.sin(vLin * 0.85 + field.phase) * field.pitch * 0.22;
    const rise = Math.max(0.2, (v - field.gatherV) / Math.max(0.4, field.pitch * field.count));
    const envelope = 0.58 + 0.42 * Math.sin(Math.min(1, Math.max(0, rise)) * Math.PI);
    const flare2 = 1 + field.flare * (Math.min(1, Math.max(0, rise)) - 0.35);
    const side = u >= 0 ? 1 + Math.max(0, field.asymmetry) : 1 - Math.max(0, field.asymmetry) * 0.62;
    const limit = field.span * envelope * flare2 * side;
    let zone = "outside";
    if (v < field.gatherV * 0.15) zone = "throat";
    else if (v < field.gatherV && Math.abs(u) < field.gatherU * side) zone = "commons";
    else if (v < field.gatherV + field.pitch * field.count && Math.abs(u) < limit) zone = "terrace";
    return { u, v, vLin, dvu, dvv, zone, limit };
  }
  function pitchOf(field) {
    return Math.max(1.15, field.pitch);
  }
  function waveFreq(field) {
    return Math.PI * 2 * (1.5 + Math.abs(field.curve) * 0.45) / Math.max(4, field.span);
  }
  function waveAmp(field) {
    const raw = 0.28 + Math.abs(field.curve) * 0.22 + Math.abs(field.flare) * 0.16;
    return Math.min(raw, pitchOf(field) * 0.28);
  }
  function waveOf(u, field) {
    return Math.sin(u * waveFreq(field) + field.phase) * waveAmp(field);
  }
  function stepIndex(vLin, field) {
    const index2 = Math.round((vLin - field.gatherV) / pitchOf(field));
    return Math.max(0, Math.min(Math.max(1, field.count) - 1, index2));
  }
  function seatLin(u, vLin, field) {
    return field.gatherV + stepIndex(vLin, field) * pitchOf(field) + waveOf(u, field);
  }
  function bandOf(vLin, field) {
    const gathering = vLin < field.gatherV + pitchOf(field) * 0.55;
    return pitchOf(field) * (gathering ? 0.46 : 0.3);
  }
  function reachOf(u, vLin, field) {
    const center = lobeU(u, vLin, field);
    const split = Math.abs(center) > 0.2;
    const half = split ? Math.max(1.15, field.span * 0.36) : Math.max(2.2, field.span * 0.72);
    return { center, half };
  }
  function lobeU(u, vLin, field) {
    const rise = (vLin - field.gatherV) / Math.max(0.4, pitchOf(field) * Math.max(1, field.count));
    if (field.branch < 0.45 || rise < 0.3) return 0;
    const sign = u === 0 ? field.phase > Math.PI ? 1 : -1 : Math.sign(u);
    return sign * field.span * (0.16 + Math.min(1, rise) * 0.4) * field.branch;
  }
  function contourHeading(u, field) {
    const slope = waveAmp(field) * waveFreq(field) * Math.cos(u * waveFreq(field) + field.phase);
    const c = Math.cos(field.axis);
    const s = Math.sin(field.axis);
    return Math.atan2(c + slope * s, -s + slope * c);
  }
  function nudge(agent, u, v, field) {
    const c = Math.cos(field.axis);
    const s = Math.sin(field.axis);
    agent.x += -u * s + v * c;
    agent.y += u * c + v * s;
  }
  function steerSteppedAmphitheater(agent, field, rng) {
    const frame9 = frameOf(agent.x, agent.y, field);
    const along4 = contourHeading(frame9.u, field);
    const reach = reachOf(frame9.u, frame9.vLin, field);
    const past = frame9.u - reach.center;
    const turning = Math.abs(past) > reach.half * 0.78;
    const forward = past > reach.half * 0.78 ? along4 + Math.PI : past < -reach.half * 0.78 ? along4 : closer(along4, agent.heading);
    const wobble = Math.sin(frame9.u * 0.31 + field.phase) * 0.08;
    agent.heading = mix(agent.heading, forward + wobble + (rng() - 0.5) * 0.06, turning ? 0.94 : 0.8);
  }
  function closer(along4, heading) {
    return Math.abs(delta(along4, heading)) <= Math.abs(delta(along4 + Math.PI, heading)) ? along4 : along4 + Math.PI;
  }
  function containSteppedAmphitheater(agent, field) {
    const frame9 = frameOf(agent.x, agent.y, field);
    const targetV = seatLin(frame9.u, frame9.vLin, field);
    const errV = frame9.vLin - targetV;
    const slack = bandOf(frame9.vLin, field);
    if (Math.abs(errV) > slack) {
      nudge(agent, 0, -Math.sign(errV) * Math.min(Math.abs(errV) - slack * 0.25, 0.55) * 0.66, field);
    }
    const reach = reachOf(frame9.u, frame9.vLin, field);
    const errU = frame9.u - reach.center;
    if (Math.abs(errU) > reach.half) {
      nudge(agent, -Math.sign(errU) * Math.min(Math.abs(errU) - reach.half, 0.4) * 0.35, 0, field);
    }
  }
  function inkSteppedAmphitheater(agent, field) {
    const frame9 = frameOf(agent.x, agent.y, field);
    const err = Math.abs(frame9.vLin - seatLin(frame9.u, frame9.vLin, field));
    if (err > bandOf(frame9.vLin, field)) return { amount: 0, width: 1 };
    const center = lobeU(frame9.u, frame9.vLin, field);
    const gap = Math.abs(center) * 0.38;
    if (gap > 0.4 && Math.abs(frame9.u) < gap) return { amount: 0, width: 1 };
    const reach = reachOf(frame9.u, frame9.vLin, field);
    if (Math.abs(frame9.u - reach.center) > reach.half * 0.7) return { amount: 0, width: 1 };
    return { amount: 0.04, width: 1 };
  }
  function spawnOnSteppedAmphitheater(field, rng) {
    const roll = rng();
    const c = Math.cos(field.axis);
    const s = Math.sin(field.axis);
    const at2 = (u2, v2) => {
      const span4 = Math.max(2.5, field.span);
      const vLin = v2 - field.curve * 0.42 * u2 * u2 / span4 - Math.sin(v2 * 0.85 + field.phase) * field.pitch * 0.08;
      return {
        x: field.gx - u2 * s + vLin * c,
        y: field.gy + u2 * c + vLin * s
      };
    };
    const count = Math.max(1, field.count);
    const index2 = Math.min(count - 1, Math.floor(roll * count));
    const pitch = pitchOf(field);
    let u = (rng() - 0.5) * field.span * (0.5 + rng() * 0.45);
    if (field.branch > 0.45 && index2 > count * 0.28) u = (rng() > 0.5 ? 1 : -1) * (0.22 + rng() * 0.38) * field.span;
    const v = field.gatherV + index2 * pitch + waveOf(u, field) + (rng() - 0.5) * 0.16;
    const p = at2(u, v);
    const along4 = contourHeading(u, field);
    return { x: p.x, y: p.y, heading: along4 + (rng() > 0.5 ? 0 : Math.PI) + (rng() - 0.5) * 0.25 };
  }

  // lib/skill1/slime-controls.ts
  function voidRadius(angle, base2, slime) {
    const a = angle - slime.voidRotation;
    const harmonic = Math.max(0.42, 1 + slime.voidLobes * Math.cos(3 * a) + slime.voidNotch * Math.cos(2 * a));
    const elong = Math.max(0.35, slime.voidElongation);
    const stretch = Math.hypot(Math.cos(a) / elong, Math.sin(a));
    return base2 * harmonic / Math.max(0.35, stretch);
  }
  var clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  var lerp = (min, max, t) => min + (max - min) * clamp(t, 0, 1);
  function slimeControlsFromTranslation(translation) {
    const { params, recipe, topology } = translation;
    const attractor = attractorFromRatings(translation, FIELD_SIZE);
    const enclosed = clamp(recipe.enclosureCollar / 3.7, 0, 1);
    const clustered = clamp(recipe.clustering, 0, 1);
    const approach = clamp(recipe.approachWidth / 4.7, 0, 1);
    const exposed = clamp(recipe.coreExposure, 0, 1);
    const isolated = clamp(recipe.isolationRadius / 6.5, 0, 1);
    const reach = clamp((params.influenceRadius - 3) / 7, 0, 1);
    const contained = topology === "contained-interior" ? 1 : 0;
    const absence = topology === "around-absence" ? 1 : 0;
    const openNet = topology === "open-network" ? 1 : 0;
    const next = {
      sensorDistance: lerp(0.25, 2.2, reach * 0.34 + params.scaleVariation * 0.28 + approach * 0.22 + openNet * 0.16 - contained * 0.18),
      sensorAngle: lerp(0.08, 1.35, params.geometryVariation * 0.55 + (1 - params.directionalBias) * 0.25 + params.geometricDisplacement * 0.2),
      turnAngle: lerp(0.05, 1.2, params.geometryVariation * 0.5 + params.geometricDisplacement * 0.28 + (1 - clustered) * 0.22),
      stepSize: lerp(0.08, 0.5, params.permeability * 0.42 + params.sourcePermeability * 0.22 + openNet * 0.2 - contained * 0.18),
      deposit: lerp(0.02, 0.22, params.flowCoupling * 0.38 + params.attractionStrength * 0.32 + contained * 0.2 + clustered * 0.1),
      depositWidth: lerp(1, 3.4, isolated * 0.45 + params.scaleVariation * 0.35 + absence * 0.2),
      diffusion: lerp(0, 0.42, params.permeability * 0.32 + params.networkDensity * 0.22 + exposed * 0.28 - enclosed * 0.18),
      decay: clamp(1 - params.decay, 0.9, 0.998),
      trailInfluence: lerp(0, 2, params.networkDensity * 0.42 + clustered * 0.28 + params.attractionStrength * 0.18 + absence * 0.12),
      resistance: lerp(0, 1, enclosed * 0.38 + (1 - params.permeability) * 0.28 + (1 - exposed) * 0.18 + contained * 0.16),
      randomness: lerp(0, 1.15, params.randomness * 2.2 + params.geometryVariation * 0.35),
      persistence: lerp(0, 0.9, params.persistence * 0.7 + clustered * 0.3),
      trailCap: lerp(0.3, 1.8, params.attractionStrength * 0.45 + params.flowCoupling * 0.35 + contained * 0.2),
      foodPoints: [{ ...attractor }],
      crowdingLimit: Math.round(lerp(8, 72, (1 - params.nodeSpacing) * 0.55 + clustered * 0.45)),
      voidElongation: lerp(0.38, 2.7, 0.35 + params.scaleVariation * 0.4 + absence * 0.25),
      voidRotation: params.geometricDisplacement * Math.PI * 0.35,
      voidLobes: params.geometryVariation * 0.62,
      voidNotch: (params.geometricDisplacement - 0.5) * 0.9
    };
    if (translation.archetypeId === "stepped-amphitheater") {
      return {
        ...next,
        sensorDistance: 1.18,
        sensorAngle: 0.4,
        turnAngle: 0.58,
        stepSize: 0.17,
        deposit: 0.085,
        depositWidth: 1.1,
        diffusion: 0.035,
        trailInfluence: 1.7,
        resistance: 0.06,
        randomness: 0.2,
        persistence: 0.74,
        trailCap: 1.55,
        crowdingLimit: 20,
        voidElongation: 1.7
      };
    }
    return next;
  }
  function densityFromTranslation(translation) {
    if (translation.archetypeId === "stepped-amphitheater") return 7;
    const { params, topology } = translation;
    const contained = topology === "contained-interior" ? 0.12 : 0;
    return Math.round(lerp(1, 10, params.networkDensity * 0.38 + params.permeability * 0.28 + params.nodeRepetition * 0.22 + contained));
  }
  function agentCountFromDensity(density) {
    const span4 = MAX_DENSITY - MIN_DENSITY;
    const t = span4 === 0 ? 0 : (density - MIN_DENSITY) / span4;
    return Math.round(MIN_AGENT_COUNT + Math.min(1, Math.max(0, t)) * (MAX_AGENT_COUNT - MIN_AGENT_COUNT));
  }

  // lib/skill1/hair-ink.ts
  var HAIR_WIDTH = 0.14;
  var HAIR_CAP = 0.36;
  var HAIR_DEPOSIT = 0.016;
  var HAIR_DECAY = 0.998;

  // lib/skill1/engine.ts
  var TWO_PI2 = Math.PI * 2;
  var clamp2 = (value, min, max) => Math.min(max, Math.max(min, value));
  function fineTrail(archetypeId2) {
    return archetypeId2 === "compressed-sequential" || archetypeId2 === "topographic-ground-field" || archetypeId2 === "linear-gallery" || archetypeId2 === "flat-deep-plan" || archetypeId2 === "undulated" || archetypeId2 === "inserted-horizontal-plate" || archetypeId2 === "terraced" || archetypeId2 === "void-field" || archetypeId2 === "linear-edge-gallery";
  }
  var wrapAngle = (angle) => {
    let next = angle % TWO_PI2;
    if (next < 0) next += TWO_PI2;
    return next;
  };
  var angleDelta = (a, b) => {
    const d = Math.abs(wrapAngle(a) - wrapAngle(b));
    return Math.min(d, TWO_PI2 - d);
  };
  var fieldIndex = (x, y, size) => Math.round(y) * size + Math.round(x);
  function sampleField(field, point, size) {
    const x = clamp2(point.x, 0, size - 1);
    const y = clamp2(point.y, 0, size - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(size - 1, x0 + 1);
    const y1 = Math.min(size - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const a = field[y0 * size + x0];
    const b = field[y0 * size + x1];
    const c = field[y1 * size + x0];
    const d = field[y1 * size + x1];
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }
  var topologyCache = /* @__PURE__ */ new Map();
  var topologyOf = (translation) => {
    let topology = topologyCache.get(translation.archetypeId);
    if (topology === void 0) {
      topology = configForArchetype(translation.archetypeId).topology;
      topologyCache.set(translation.archetypeId, topology);
    }
    return topology;
  };
  var aroundAbsence = (translation) => translation.archetypeId !== "stepped-amphitheater" && topologyOf(translation) === "around-absence";
  var containedInterior = (translation) => topologyOf(translation) === "contained-interior";
  var dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function buildAttractionField(size, attractor, translation, slime) {
    const { attractionStrength, influenceRadius, scaleVariation } = translation.params;
    const field = new Array(size * size).fill(0);
    if (translation.archetypeId === "void-field" && translation.recipe.attractors?.length) {
      const circulation = translation.recipe.attractors.filter((item) => item.kind !== "ring" && !item.hole);
      paintAttractorList(field, size, circulation.length ? circulation : translation.recipe.attractors, attractionStrength, slime);
      return field;
    }
    if (translation.recipe.attractorsOnly && translation.recipe.attractors?.length) {
      paintAttractorList(field, size, translation.recipe.attractors, attractionStrength, slime);
      return field;
    }
    if (aroundAbsence(translation)) {
      const ringR = translation.recipe.isolationRadius * (0.7 + scaleVariation * 0.12);
      const sigma2 = Math.max(1.05, influenceRadius * 0.16);
      const twoSigma2 = 2 * sigma2 * sigma2;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const d = Math.hypot(x - attractor.x, y - attractor.y);
          const angle = Math.atan2(y - attractor.y, x - attractor.x);
          const wobble = slime ? voidRadius(angle, 1, slime) : 1 + 0.16 * Math.cos(angle * 2.15) + 0.09 * Math.cos(angle * 5.4 + 0.6);
          const r = ringR * wobble;
          field[fieldIndex(x, y, size)] = attractionStrength * Math.exp(-((d - r) * (d - r)) / twoSigma2);
        }
      }
      addRecipeAttractors(field, size, translation);
      return field;
    }
    if (translation.recipe.attractors?.length) {
      paintAttractorList(field, size, attractorList(attractor, translation), attractionStrength);
      return field;
    }
    if (!containedInterior(translation)) {
      const radius2 = Math.max(
        2.2,
        translation.recipe.isolationRadius * (1.35 + scaleVariation * 0.5)
      );
      const sigma2 = radius2 * (0.78 + scaleVariation * 0.22);
      const twoSigma2 = 2 * sigma2 * sigma2;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const d = Math.hypot(x - attractor.x, y - attractor.y);
          field[fieldIndex(x, y, size)] = attractionStrength * Math.exp(-(d * d) / twoSigma2);
        }
      }
      return field;
    }
    const radius = Math.max(
      1.2,
      translation.recipe.isolationRadius * (1.05 + scaleVariation * 0.45)
    );
    const sigma = radius * (0.62 + scaleVariation * 0.28);
    const twoSigma = 2 * sigma * sigma;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const d = Math.hypot(x - attractor.x, y - attractor.y);
        field[fieldIndex(x, y, size)] = attractionStrength * Math.exp(-(d * d) / twoSigma);
      }
    }
    return field;
  }
  function distanceToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2));
    return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
  }
  function attractorList(primary, translation) {
    const extras = translation.recipe.attractors ?? [];
    if (translation.recipe.attractorFixed && extras.length) return extras;
    if (aroundAbsence(translation)) {
      return extras.length ? extras : [{ kind: "point", x: primary.x, y: primary.y }];
    }
    const primaryMark = { kind: "point", x: primary.x, y: primary.y, radius: 2.2 };
    if (!extras.length) return [primaryMark];
    const covered = extras.some(
      (item) => item.kind !== "line" && item.kind !== "curve" && Math.hypot(item.x - primary.x, item.y - primary.y) < 0.45
    );
    return covered ? extras : [primaryMark, ...extras];
  }
  function curveEnds(item) {
    const x2 = item.x2 ?? item.x + 3;
    const y2 = item.y2 ?? item.y;
    return {
      x: item.x,
      y: item.y,
      x2,
      y2,
      cx: item.cx ?? (item.x + x2) / 2,
      cy: item.cy ?? (item.y + y2) / 2 + 1.6
    };
  }
  function pointOnCurve(item, t) {
    const curve = curveEnds(item);
    const u = 1 - t;
    return {
      x: u * u * curve.x + 2 * u * t * curve.cx + t * t * curve.x2,
      y: u * u * curve.y + 2 * u * t * curve.cy + t * t * curve.y2
    };
  }
  function nearestOnCurve(from, item) {
    let best = pointOnCurve(item, 0);
    let bestD = dist(from, best);
    for (let step = 1; step <= 24; step += 1) {
      const point = pointOnCurve(item, step / 24);
      const d = dist(from, point);
      if (d < bestD) {
        best = point;
        bestD = d;
      }
    }
    return best;
  }
  function pullPoint(from, item, heading) {
    if (isVoidCorridor(item)) {
      const on = item.kind === "curve" ? nearestOnCurve(from, item) : nearestOnLine(from, item);
      const dx = from.x - on.x;
      const dy = from.y - on.y;
      const d = Math.hypot(dx, dy) || 1e-4;
      const radius = Math.max(0.6, item.radius ?? 1.2);
      return { x: on.x + dx / d * radius, y: on.y + dy / d * radius };
    }
    if (item.kind === "curve") return nearestOnCurve(from, item);
    if (item.kind === "line") {
      const ax = item.x;
      const ay = item.y;
      const bx = item.x2 ?? item.x;
      const by = item.y2 ?? item.y;
      const abx = bx - ax;
      const aby = by - ay;
      const len2 = abx * abx + aby * aby || 1;
      const t = Math.max(0, Math.min(1, ((from.x - ax) * abx + (from.y - ay) * aby) / len2));
      return { x: ax + abx * t, y: ay + aby * t };
    }
    if (item.kind === "ring" || item.kind === "point" && isVoidDisk(item)) return ringAroundPoint(from, item, heading);
    return { x: item.x, y: item.y };
  }
  function nearestOnLine(from, item) {
    const ax = item.x;
    const ay = item.y;
    const bx = item.x2 ?? item.x;
    const by = item.y2 ?? item.y;
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, ((from.x - ax) * abx + (from.y - ay) * aby) / len2));
    return { x: ax + abx * t, y: ay + aby * t };
  }
  function ringAroundPoint(from, item, heading) {
    const radius = circleRadius(item);
    const dx = from.x - item.x;
    const dy = from.y - item.y;
    const d = Math.hypot(dx, dy) || 1e-4;
    const base2 = Math.atan2(dy, dx);
    if (d <= radius + 0.08) {
      const nx = dx / d;
      const ny = dy / d;
      const t1 = Math.atan2(nx, -ny);
      const t2 = Math.atan2(-nx, ny);
      const travel = heading == null || angleDelta(t1, heading) <= angleDelta(t2, heading) ? t1 : t2;
      return { x: from.x + Math.cos(travel) * 0.9, y: from.y + Math.sin(travel) * 0.9 };
    }
    const offset = Math.acos(Math.min(1, radius / d));
    const p1 = { x: item.x + Math.cos(base2 + offset) * radius, y: item.y + Math.sin(base2 + offset) * radius };
    const p2 = { x: item.x + Math.cos(base2 - offset) * radius, y: item.y + Math.sin(base2 - offset) * radius };
    if (heading == null) return p1;
    const h1 = Math.atan2(p1.y - from.y, p1.x - from.x);
    const h2 = Math.atan2(p2.y - from.y, p2.x - from.x);
    return angleDelta(h1, heading) <= angleDelta(h2, heading) ? p1 : p2;
  }
  function nearestAttractorPoint(from, primary, translation, heading) {
    const all = attractorList(primary, translation);
    const list = translation.archetypeId === "void-field" ? all.filter((item) => item.kind !== "ring" && !item.hole) : all;
    const marks = list.length ? list : all;
    let best = pullPoint(from, marks[0], heading);
    let bestD = dist(from, best);
    for (let i = 1; i < marks.length; i += 1) {
      const point = pullPoint(from, marks[i], heading);
      const d = dist(from, point);
      if (d < bestD) {
        best = point;
        bestD = d;
      }
    }
    return best;
  }
  function paintAttractorList(field, size, list, gainBase, slime) {
    for (const item of list) {
      const gain = gainBase * (item.strength ?? 1);
      const spread = Math.max(0.75, item.kind === "ring" ? 1.15 : item.radius ?? 2.2);
      const twoSigma = 2 * spread * spread;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          let d = 0;
          if (isVoidCorridor(item)) {
            const radial = item.kind === "curve" ? dist({ x, y }, nearestOnCurve({ x, y }, item)) : distanceToSegment(x, y, item.x, item.y, item.x2 ?? item.x, item.y2 ?? item.y);
            const limit = Math.max(0.55, item.radius ?? 1.2);
            if (radial < limit) continue;
            d = radial - limit;
          } else if (item.kind === "line") {
            d = distanceToSegment(x, y, item.x, item.y, item.x2 ?? item.x, item.y2 ?? item.y);
          } else if (item.kind === "curve") {
            d = dist({ x, y }, nearestOnCurve({ x, y }, item));
          } else if (isVoidDisk(item)) {
            const radial = Math.hypot(x - item.x, y - item.y);
            const limit = polarVoidRadius(item, { x, y }, slime);
            if (radial < limit) continue;
            d = radial - limit;
          } else {
            d = Math.hypot(x - item.x, y - item.y);
          }
          field[fieldIndex(x, y, size)] += gain * Math.exp(-(d * d) / twoSigma);
        }
      }
    }
  }
  function addRecipeAttractors(field, size, translation) {
    const list = translation.recipe.attractors;
    if (!list?.length) return;
    paintAttractorList(field, size, list, translation.params.attractionStrength);
  }
  function buildPermeabilityField(size, _source, _attractor, translation) {
    return new Array(size * size).fill(translation.params.permeability);
  }
  function circleRadius(item) {
    if (item.kind === "line" || item.kind === "curve") return 0;
    return Math.max(0.2, item.radius ?? (item.kind === "ring" ? 4 : 1.6));
  }
  function isVoidDisk(item) {
    if (item.kind === "line" || item.kind === "curve") return false;
    return item.hole === true || item.kind === "ring";
  }
  function isVoidCorridor(item) {
    return (item.kind === "line" || item.kind === "curve") && item.hole === true;
  }
  function isGroundDisk(item) {
    return item.hole !== true && item.kind !== "line" && item.kind !== "curve" && item.kind !== "ring";
  }
  function nearestContainedField(point, translation) {
    const list = translation.recipe.attractors;
    if (!list?.length) return null;
    let best = null;
    for (const item of list) {
      if (item.hole || item.kind === "ring") continue;
      let px = item.x;
      let py = item.y;
      if (item.kind === "curve") {
        const on = nearestOnCurve(point, item);
        px = on.x;
        py = on.y;
      } else if (item.kind === "line") {
        const on = nearestOnLine(point, item);
        px = on.x;
        py = on.y;
      }
      const d = Math.hypot(point.x - px, point.y - py);
      if (!best || d < best.d) best = { d, px, py };
    }
    return best;
  }
  var FLAT_DEEP_BODY = 1.15;
  function nearestFlatDeep(point, translation) {
    const list = translation.recipe.attractors;
    if (!list?.length) return null;
    let best = null;
    for (const item of list) {
      let px = item.x;
      let py = item.y;
      let ax = item.x;
      let ay = item.y;
      let bx = item.x2 ?? item.x;
      let by = item.y2 ?? item.y;
      if (item.kind === "curve") {
        const on = nearestOnCurve(point, item);
        px = on.x;
        py = on.y;
        const ahead = pointOnCurve(item, 1);
        bx = ahead.x;
        by = ahead.y;
      } else if (item.x2 != null) {
        const on = nearestOnLine(point, item);
        px = on.x;
        py = on.y;
      }
      const d = Math.hypot(point.x - px, point.y - py);
      if (!best || d < best.d) best = { d, px, py, ax, ay, bx, by };
    }
    return best;
  }
  function onFlatDeepWall(point, translation) {
    const near = nearestFlatDeep(point, translation);
    return !!near && near.d <= FLAT_DEEP_BODY;
  }
  function guideFlatDeep(agent, translation) {
    const near = nearestFlatDeep(agent, translation);
    if (!near || near.d < 0.55) return;
    const tangent = Math.atan2(near.by - near.ay, near.bx - near.ax);
    const forward = angleDelta(tangent, agent.heading) <= angleDelta(tangent + Math.PI, agent.heading) ? tangent : tangent + Math.PI;
    const onto = Math.atan2(near.py - agent.y, near.px - agent.x);
    const pull = near.d > FLAT_DEEP_BODY ? 0.5 : 0.1;
    agent.heading = wrapAngle(agent.heading * (1 - pull) + (forward * 0.7 + onto * 0.3) * pull);
    if (near.d > FLAT_DEEP_BODY) {
      const keep = FLAT_DEEP_BODY / near.d;
      agent.x = near.px + (agent.x - near.px) * keep;
      agent.y = near.py + (agent.y - near.py) * keep;
    }
  }
  function tgfKeepsPads(translation) {
    if (translation.archetypeId !== "topographic-ground-field") return false;
    const list = translation.recipe.attractors;
    if (!list?.length) return false;
    return !list.some((item) => item.hole === true || item.kind === "ring");
  }
  function nearestGroundPad(point, translation) {
    const list = translation.recipe.attractors;
    if (!list?.length) return null;
    let best = null;
    for (const item of list) {
      if (!isGroundDisk(item)) continue;
      const d = Math.hypot(point.x - item.x, point.y - item.y);
      if (!best || d < best.d) best = { d, x: item.x, y: item.y, radius: Math.max(1.4, item.radius ?? 1.8) };
    }
    return best;
  }
  function polarVoidRadius(item, point, slime) {
    const base2 = circleRadius(item);
    if (base2 <= 0) return 0;
    if (!slime) return base2;
    return voidRadius(Math.atan2(point.y - item.y, point.x - item.x), base2, slime);
  }
  function fringedVoid(archetypeId2) {
    return archetypeId2 === "void-edge" || archetypeId2 === "linear-edge-gallery";
  }
  function verticalVoidReach(angle, base2) {
    const lump = 0.72 + 0.06 * Math.sin(angle * 1.45 + 0.4) + 0.04 * Math.sin(angle * 2.25 + 1.3);
    return base2 * lump;
  }
  function fringeReach(angle, base2) {
    const lump = 0.46 + 0.07 * Math.sin(angle * 1.35 + 0.4) + 0.05 * Math.sin(angle * 2.15 + 1.6);
    return base2 * lump;
  }
  function emptyReach(archetypeId2, angle, base2) {
    if (archetypeId2 === "void-edge") {
      const lump = 0.96 + 0.02 * Math.sin(angle * 1.7 + 0.3);
      return base2 * lump;
    }
    if (archetypeId2 === "linear-edge-gallery") {
      const lump = 0.9 + 0.04 * Math.sin(angle * 1.55 + 0.2) + 0.03 * Math.sin(angle * 2.35 + 1.1);
      return base2 * lump;
    }
    return fringeReach(angle, base2);
  }
  function insideAttractorHole(point, translation, slime) {
    const list = translation.recipe.attractors;
    if (!list) return false;
    if (translation.archetypeId === "vertical-void") return false;
    const fringed = fringedVoid(translation.archetypeId);
    const core = fringed ? 1 : 0.58;
    for (const item of list) {
      if (isVoidCorridor(item)) {
        const radial = item.kind === "curve" ? dist(point, nearestOnCurve(point, item)) : distanceToSegment(point.x, point.y, item.x, item.y, item.x2 ?? item.x, item.y2 ?? item.y);
        const along4 = item.kind === "curve" ? Math.atan2(point.y - (item.cy ?? item.y), point.x - (item.cx ?? item.x)) : Math.atan2((item.y2 ?? item.y) - item.y, (item.x2 ?? item.x) - item.x);
        const limit2 = fringed ? emptyReach(translation.archetypeId, along4 + radial * 4, Math.max(0.55, item.radius ?? 1.2)) : Math.max(0.55, item.radius ?? 1.2) * core;
        if (radial < limit2) return true;
        continue;
      }
      if (!isVoidDisk(item)) continue;
      const radius = polarVoidRadius(item, point, slime);
      if (radius <= 0) continue;
      const angle = Math.atan2(point.y - item.y, point.x - item.x);
      const limit = translation.archetypeId === "vertical-void" ? verticalVoidReach(angle, radius) : fringed ? emptyReach(translation.archetypeId, angle, radius) : radius * core;
      if (Math.hypot(point.x - item.x, point.y - item.y) < limit) return true;
    }
    return false;
  }
  var holeMasks = /* @__PURE__ */ new Map();
  function holeMaskFor(trailSize, fieldSize, translation, slime) {
    const list = translation.recipe.attractors ?? [];
    const shape = slime ? `${slime.voidElongation.toFixed(3)},${slime.voidRotation.toFixed(3)},${slime.voidLobes.toFixed(3)},${slime.voidNotch.toFixed(3)}` : "circle";
    const key = `${trailSize}|${fieldSize}|${shape}|${list.map((item) => {
      if (isVoidCorridor(item)) return `c${item.x},${item.y},${item.x2},${item.y2},${item.radius ?? 0}`;
      if (!isVoidDisk(item)) return "";
      const radius = circleRadius(item);
      return radius > 0 ? `${item.x},${item.y},${radius}` : "";
    }).join(";")}`;
    let mask = holeMasks.get(key);
    if (!mask) {
      const scale = trailSize / fieldSize;
      mask = new Uint8Array(trailSize * trailSize);
      for (let i = 0; i < mask.length; i += 1) {
        const fx = i % trailSize / scale;
        const fy = Math.floor(i / trailSize) / scale;
        if (insideAttractorHole({ x: fx, y: fy }, translation, slime)) mask[i] = 1;
      }
      if (holeMasks.size >= 16) holeMasks.delete(holeMasks.keys().next().value);
      holeMasks.set(key, mask);
    }
    return mask;
  }
  function eraseTrailsInsideCircles(trails, trailSize, fieldSize, translation, slime) {
    if (tgfKeepsPads(translation)) {
      return;
    }
    const list = translation.recipe.attractors;
    if (!list?.some((item) => isVoidDisk(item) && circleRadius(item) > 0 || isVoidCorridor(item))) return;
    const book = trailBook(trails);
    const hole2 = holeMaskFor(trailSize, fieldSize, translation, slime);
    let write = 0;
    for (let n = 0; n < book.active.length; n += 1) {
      const i = book.active[n];
      if (hole2[i]) {
        trails[i] = 0;
        book.stamp[i] = 0;
        continue;
      }
      book.active[write] = i;
      write += 1;
    }
    book.active.length = write;
  }
  function pressedAgainstVoid(agent, translation, slime) {
    const list = translation.recipe.attractors;
    if (!list) return false;
    for (const item of list) {
      if (!isVoidDisk(item) || circleRadius(item) <= 0) continue;
      const radius = polarVoidRadius(item, agent, slime);
      if (Math.hypot(agent.x - item.x, agent.y - item.y) < radius + 0.65) return true;
    }
    return false;
  }
  function keepOutsideCircles(agent, fromX, fromY, translation, size, slime) {
    const list = translation.recipe.attractors;
    if (!list) return;
    for (let pass = 0; pass < 2; pass += 1) {
      for (const item of list) {
        if (!isVoidDisk(item) || circleRadius(item) <= 0) continue;
        const angle = Math.atan2(agent.y - item.y, agent.x - item.x);
        const radius = polarVoidRadius(item, agent, slime);
        const endDist = Math.hypot(agent.x - item.x, agent.y - item.y);
        if (endDist >= radius + 0.02 && translation.archetypeId !== "vertical-void") continue;
        if (translation.archetypeId === "vertical-void") {
          const limit = verticalVoidReach(angle, radius);
          if (endDist >= limit) continue;
          const wobble = 0.5 + 0.5 * Math.sin(angle * 2.7 + item.x);
          const out2 = limit + 0.2 + wobble * 0.95;
          agent.x = clamp2(item.x + Math.cos(angle) * out2, 0.18, size - 0.18);
          agent.y = clamp2(item.y + Math.sin(angle) * out2, 0.18, size - 0.18);
          continue;
        }
        if (fringedVoid(translation.archetypeId)) {
          const limit = emptyReach(translation.archetypeId, angle, radius);
          if (endDist >= limit) continue;
          const wobble = 0.5 + 0.5 * Math.sin(angle * 2.4 + item.y);
          const edge = translation.archetypeId === "linear-edge-gallery";
          const exit = edge ? angle + Math.sin(agent.x * 11.3 + agent.y * 6.7) * 0.55 : angle;
          const out2 = edge ? limit + 0.55 + wobble * 1.15 : limit + 0.08 + wobble * 0.22;
          agent.x = clamp2(item.x + Math.cos(exit) * out2, 0.18, size - 0.18);
          agent.y = clamp2(item.y + Math.sin(exit) * out2, 0.18, size - 0.18);
          continue;
        }
        const fromAngle = Math.atan2(fromY - item.y, fromX - item.x);
        const out = radius + 0.04;
        agent.x = clamp2(item.x + Math.cos(endDist > 1e-3 ? angle : fromAngle) * out, 0.18, size - 0.18);
        agent.y = clamp2(item.y + Math.sin(endDist > 1e-3 ? angle : fromAngle) * out, 0.18, size - 0.18);
        const nx = agent.x - item.x;
        const ny = agent.y - item.y;
        const nm = Math.hypot(nx, ny) || 1;
        if (translation.archetypeId === "void-field") {
          agent.heading = Math.atan2(ny, nx);
          continue;
        }
        const t1 = Math.atan2(nx / nm, -ny / nm);
        const t2 = Math.atan2(-nx / nm, ny / nm);
        agent.heading = angleDelta(t1, agent.heading) <= angleDelta(t2, agent.heading) ? t1 : t2;
      }
    }
  }
  function toTrail(point, scale) {
    return { x: point.x * scale, y: point.y * scale };
  }
  function foodPull(look, foods, strength) {
    let pull = 0;
    const sigma = 2.4;
    const twoSigma = 2 * sigma * sigma;
    for (const food of foods) {
      const d = dist(look, food);
      pull += strength * Math.exp(-(d * d) / twoSigma);
    }
    return pull;
  }
  function sense(fieldPoint, heading, distance, trails, trailSize, translation, state2, foods, slime) {
    const look = {
      x: fieldPoint.x + Math.cos(heading) * distance,
      y: fieldPoint.y + Math.sin(heading) * distance
    };
    const trailPos = toTrail(look, trailSize / FIELD_SIZE);
    const trail = sampleField(trails, trailPos, trailSize);
    const attraction = sampleField(state2.attraction, look, state2.size);
    const target = nearestAttractorPoint(look, state2.attractor, translation, heading);
    const toAttractor = {
      x: target.x - look.x,
      y: target.y - look.y
    };
    const mag = Math.hypot(toAttractor.x, toAttractor.y) || 1;
    const alignment = Math.max(
      0,
      (Math.cos(heading) * toAttractor.x + Math.sin(heading) * toAttractor.y) / mag
    );
    const { params } = translation;
    const trailFollow = 0.48 + params.networkDensity * 0.85 + (containedInterior(translation) ? params.flowCoupling * 0.28 : 0);
    const pull = 0.16 + params.attractionStrength * 0.5;
    if (aroundAbsence(translation) && translation.archetypeId !== "void-field") {
      const core = dist(look, state2.attractor);
      const angle = Math.atan2(look.y - state2.attractor.y, look.x - state2.attractor.x);
      const opening = 0.5 + 0.5 * Math.cos(angle * 2.05 + 0.4);
      const keep = slime ? voidRadius(angle, translation.recipe.isolationRadius * 0.42, slime) : translation.recipe.isolationRadius * (0.28 + 0.24 * opening);
      if (core < keep) {
        return trail * 0.08 - 0.95 - (keep - core) * 0.18;
      }
    }
    const extraFood = foods && foods.length > 1 ? foodPull(look, foods.slice(1), params.attractionStrength) : 0;
    if (insideAttractorHole(look, translation, slime) && translation.archetypeId !== "void-field") return -2;
    const influence = slime?.trailInfluence ?? 1;
    const resistance = sampleResistance(look, state2.size, slime?.resistance ?? 0);
    return trail * trailFollow * influence + (translation.archetypeId === "continuous-hall" ? 0 : attraction * pull) + extraFood + params.permeability * 0.03 + alignment * params.directionalBias - resistance * 1.35;
  }
  function sampleResistance(point, size, amount) {
    if (amount <= 1e-3) return 0;
    const nx = point.x / Math.max(1, size - 1);
    const ny = point.y / Math.max(1, size - 1);
    const gradient = nx * 0.55 + ny * 0.2;
    const patch = Math.exp(-((nx - 0.68) ** 2 + (ny - 0.32) ** 2) / 0.06);
    const local = Math.min(1, Math.max(0, gradient * 0.45 + patch * 0.7));
    return Math.min(1, amount * local);
  }
  function nearestUndulated(agent, translation) {
    const marks = translation.recipe.attractors;
    if (!marks?.length) return null;
    let bestD = Infinity;
    let ax = 0;
    let ay = 0;
    let bx = 0;
    let by = 0;
    let px = 0;
    let py = 0;
    let tip = false;
    for (const mark of marks) {
      if (mark.x2 == null) continue;
      const x2 = mark.x2;
      const y2 = mark.y2 ?? mark.y;
      const abx = x2 - mark.x;
      const aby = y2 - mark.y;
      const len2 = abx * abx + aby * aby || 1;
      const t = Math.max(0, Math.min(1, ((agent.x - mark.x) * abx + (agent.y - mark.y) * aby) / len2));
      const qx = mark.x + abx * t;
      const qy = mark.y + aby * t;
      const d = Math.hypot(agent.x - qx, agent.y - qy);
      if (d < bestD) {
        bestD = d;
        ax = mark.x;
        ay = mark.y;
        bx = x2;
        by = y2;
        px = qx;
        py = qy;
        tip = mark.cover === 1;
      }
    }
    if (!Number.isFinite(bestD)) return null;
    return { d: bestD, ax, ay, bx, by, px, py, tip };
  }
  function nearestVoidCirculation(agent, translation) {
    const marks = translation.recipe.attractors;
    if (!marks?.length) return null;
    let bestD = Infinity;
    let ax = 0;
    let ay = 0;
    let bx = 0;
    let by = 0;
    let px = agent.x;
    let py = agent.y;
    for (const mark of marks) {
      if (mark.kind === "ring" || mark.hole) continue;
      const on = mark.kind === "curve" ? nearestOnCurve(agent, mark) : nearestOnLine(agent, mark);
      const d = Math.hypot(agent.x - on.x, agent.y - on.y);
      if (d >= bestD) continue;
      bestD = d;
      px = on.x;
      py = on.y;
      if (mark.kind === "curve") {
        const ahead = pointOnCurve(mark, 1);
        ax = mark.x;
        ay = mark.y;
        bx = ahead.x;
        by = ahead.y;
      } else {
        ax = mark.x;
        ay = mark.y;
        bx = mark.x2 ?? mark.x;
        by = mark.y2 ?? mark.y;
      }
    }
    if (!Number.isFinite(bestD)) return null;
    return { d: bestD, ax, ay, bx, by, px, py };
  }
  function nearestGalleryCurve(agent, translation) {
    const marks = translation.recipe.attractors;
    if (!marks?.length) return null;
    let best = null;
    let bestScore = Infinity;
    for (const mark of marks) {
      if (mark.kind !== "curve" && mark.kind !== "line" || mark.hole) continue;
      let onX = mark.x;
      let onY = mark.y;
      let ax = mark.x;
      let ay = mark.y;
      let bx = mark.x2 ?? mark.x;
      let by = mark.y2 ?? mark.y;
      let alongT = 0.5;
      if (mark.kind === "curve") {
        let bestT = 0;
        let bestD = Infinity;
        for (let step = 0; step <= 16; step += 1) {
          const point = pointOnCurve(mark, step / 16);
          const d2 = Math.hypot(agent.x - point.x, agent.y - point.y);
          if (d2 < bestD) {
            bestD = d2;
            bestT = step / 16;
            onX = point.x;
            onY = point.y;
            alongT = bestT;
          }
        }
        const ahead = pointOnCurve(mark, Math.min(1, bestT + 0.1));
        const behind = pointOnCurve(mark, Math.max(0, bestT - 0.1));
        ax = behind.x;
        ay = behind.y;
        bx = ahead.x;
        by = ahead.y;
      } else {
        const abx = bx - ax;
        const aby = by - ay;
        const span22 = abx * abx + aby * aby || 1;
        alongT = Math.max(0, Math.min(1, ((agent.x - ax) * abx + (agent.y - ay) * aby) / span22));
        onX = ax + abx * alongT;
        onY = ay + aby * alongT;
      }
      const endX = mark.x2 ?? mark.x;
      const endY = mark.y2 ?? mark.y;
      const chord = Math.hypot(endX - mark.x, endY - mark.y);
      const bow = mark.cx == null ? 0 : Math.hypot(mark.cx - (mark.x + endX) / 2, (mark.cy ?? mark.y) - (mark.y + endY) / 2);
      const len = Math.max(chord, bow * 1.4);
      if (len < 3.2) continue;
      const d = Math.hypot(agent.x - onX, agent.y - onY);
      const score = d - len * 0.2;
      if (score >= bestScore) continue;
      const forward = Math.atan2(by - ay, bx - ax);
      const back = forward + Math.PI;
      let heading = angleDelta(forward, agent.heading) <= angleDelta(back, agent.heading) ? forward : back;
      const leavingLeft = onX < 2.5 && Math.cos(heading) < 0;
      const leavingRight = onX > FIELD_SIZE - 2.5 && Math.cos(heading) > 0;
      if (leavingLeft || leavingRight) heading += Math.PI;
      bestScore = score;
      best = {
        x: onX,
        y: onY,
        d,
        heading,
        along: alongT,
        radius: mark.radius ?? 0.35
      };
    }
    return best;
  }
  function holdLinearGallery(agent, translation) {
    const near = nearestGalleryCurve(agent, translation);
    if (!near) return null;
    const slot = 0.62;
    const outer = 1.55;
    let dx = agent.x - near.x;
    let dy = agent.y - near.y;
    let distFromSpine = Math.hypot(dx, dy);
    if (distFromSpine < 0.05) {
      dx = -Math.sin(near.heading);
      dy = Math.cos(near.heading);
      distFromSpine = 1;
    }
    const nx = dx / distFromSpine;
    const ny = dy / distFromSpine;
    if (distFromSpine < slot) {
      const pull = Math.min(0.7, slot - distFromSpine + 0.2);
      agent.x += nx * pull;
      agent.y += ny * pull;
    } else if (distFromSpine > outer) {
      const pull = Math.min(0.55, distFromSpine - outer);
      agent.x -= nx * pull;
      agent.y -= ny * pull;
    }
    const correcting = distFromSpine < slot || distFromSpine > outer;
    const atEnd = near.along < 0.08 || near.along > 0.92;
    const travel = atEnd ? near.heading + Math.PI : near.heading;
    const weight = correcting || atEnd ? 0.84 : 0.62;
    agent.heading = wrapAngle(agent.heading * (1 - weight) + travel * weight);
    const seated = Math.hypot(agent.x - near.x, agent.y - near.y);
    return { d: seated, band: outer, slot };
  }
  var PLATE_BODY = 0.95;
  var UNDULATED_PATH = 2.35;
  function guidePlate(agent, translation) {
    const near = nearestUndulated(agent, translation);
    if (!near) return;
    const tangent = Math.atan2(near.by - near.ay, near.bx - near.ax);
    const len2 = (near.bx - near.ax) ** 2 + (near.by - near.ay) ** 2 || 1;
    const along4 = ((agent.x - near.ax) * (near.bx - near.ax) + (agent.y - near.ay) * (near.by - near.ay)) / len2;
    const forward = along4 > 0.9 ? tangent + Math.PI : along4 < 0.1 ? tangent : angleDelta(tangent, agent.heading) <= angleDelta(tangent + Math.PI, agent.heading) ? tangent : tangent + Math.PI;
    const weight = near.d > PLATE_BODY ? 0.64 : 0.86;
    agent.heading = wrapAngle(agent.heading * (1 - weight) + forward * weight);
  }
  function guideUndulated(agent, translation) {
    const near = nearestUndulated(agent, translation);
    if (!near || near.d < 0.9) return;
    const tangent = Math.atan2(near.by - near.ay, near.bx - near.ax);
    const forward = angleDelta(tangent, agent.heading) <= angleDelta(tangent + Math.PI, agent.heading) ? tangent : tangent + Math.PI;
    const onto = Math.atan2(near.py - agent.y, near.px - agent.x);
    const pull = near.d > UNDULATED_PATH ? 0.48 : 0.16;
    agent.heading = wrapAngle(agent.heading * (1 - pull) + (forward * 0.7 + onto * 0.3) * pull);
  }
  var HALL_SLOT = 0.62;
  var HALL_OUTER = 1.85;
  function hallContact(agent, translation) {
    const near = nearestUndulated(agent, translation);
    if (!near) return null;
    const abx = near.bx - near.ax;
    const aby = near.by - near.ay;
    const len2 = abx * abx + aby * aby || 1;
    const along4 = ((agent.x - near.ax) * abx + (agent.y - near.ay) * aby) / len2;
    return { ...near, along: along4 };
  }
  function guideHall(agent, translation) {
    const near = hallContact(agent, translation);
    if (!near || near.d <= 2.4) return;
    let dx = agent.x - near.px;
    let dy = agent.y - near.py;
    const distFrom = Math.hypot(dx, dy) || 1;
    const pull = Math.min(0.08, near.d - 2.4);
    agent.x -= dx / distFrom * pull;
    agent.y -= dy / distFrom * pull;
  }
  var TERRACE_PLATE = 0.34;
  function nearestTerraced(agent, translation) {
    const marks = translation.recipe.attractors;
    if (!marks?.length) return null;
    let best = Infinity;
    let found = null;
    for (const mark of marks) {
      if (mark.x2 == null && mark.kind !== "curve") continue;
      let qx = mark.x;
      let qy = mark.y;
      let ax = mark.x;
      let ay = mark.y;
      let bx = mark.x2 ?? mark.x;
      let by = mark.y2 ?? mark.y;
      if (mark.kind === "curve") {
        const q = nearestOnCurve(agent, mark);
        qx = q.x;
        qy = q.y;
      } else {
        const abx = bx - ax;
        const aby = by - ay;
        const len2 = abx * abx + aby * aby || 1;
        const t = Math.max(0, Math.min(1, ((agent.x - ax) * abx + (agent.y - ay) * aby) / len2));
        qx = ax + abx * t;
        qy = ay + aby * t;
      }
      const d = Math.hypot(agent.x - qx, agent.y - qy);
      const plate = (mark.radius ?? 0) >= TERRACE_PLATE;
      const score = d - (plate ? 0.4 : 0);
      if (score < best) {
        best = score;
        const span22 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay) || 1;
        const along4 = Math.max(0, Math.min(1, ((qx - ax) * (bx - ax) + (qy - ay) * (by - ay)) / span22));
        const stroke2 = (mark.stroke ?? 1) + ((mark.stroke2 ?? mark.stroke ?? 1) - (mark.stroke ?? 1)) * along4;
        found = {
          d,
          px: qx,
          py: qy,
          ax,
          ay,
          bx,
          by,
          plate,
          radius: mark.radius ?? (plate ? 0.6 : 0.22),
          along: along4,
          stroke: stroke2,
          mass: mark.mass ?? 1,
          cover: mark.cover ?? 1,
          coverAt: mark.coverAt ?? 0
        };
      }
    }
    return found;
  }
  var TERRACE_BODY = 1.7;
  function holdTerraced(agent, translation, _slime) {
    const near = nearestTerraced(agent, translation);
    if (!near || near.d < 0.55) return;
    const tangent = Math.atan2(near.by - near.ay, near.bx - near.ax);
    const forward = angleDelta(tangent, agent.heading) <= angleDelta(tangent + Math.PI, agent.heading) ? tangent : tangent + Math.PI;
    const onto = Math.atan2(near.py - agent.y, near.px - agent.x);
    const pull = near.d > TERRACE_BODY ? 0.5 : 0.1;
    agent.heading = wrapAngle(agent.heading * (1 - pull) + (forward * 0.7 + onto * 0.3) * pull);
    if (near.d > TERRACE_BODY) {
      const keep = TERRACE_BODY / near.d;
      agent.x = near.px + (agent.x - near.px) * keep;
      agent.y = near.py + (agent.y - near.py) * keep;
    }
  }
  function onTerracedPlate(agent, translation) {
    const near = nearestTerraced(agent, translation);
    if (!near) return false;
    return near.d < TERRACE_BODY;
  }
  function spawnAgent(source, attractor, translation, rng) {
    const { params, recipe } = translation;
    let x;
    let y;
    let heading;
    if (translation.archetypeId === "void-field" && recipe.attractors?.length) {
      const marks = recipe.attractors;
      const field = marks.filter((item) => item.kind !== "ring" && !item.hole);
      const pool = field.length ? field : marks;
      const mark = pool[Math.floor(rng() * pool.length)] ?? pool[0];
      const angle = rng() * TWO_PI2;
      const jitter = 0.12 + rng() * 0.45;
      x = clamp2(mark.x + Math.cos(angle) * jitter, 0.35, FIELD_SIZE - 0.35);
      y = clamp2(mark.y + Math.sin(angle) * jitter, 0.35, FIELD_SIZE - 0.35);
      heading = rng() * TWO_PI2;
    } else if ((translation.archetypeId === "undulated" || translation.archetypeId === "inserted-horizontal-plate") && recipe.attractors?.length) {
      const marks = recipe.attractors;
      const mark = marks[Math.floor(rng() * marks.length)] ?? marks[0];
      const t = rng();
      if (mark.kind === "curve") {
        const at2 = pointOnCurve(mark, t);
        const ahead = pointOnCurve(mark, Math.min(1, t + 0.12));
        x = clamp2(at2.x, 0.2, FIELD_SIZE - 0.2);
        y = clamp2(at2.y, 0.2, FIELD_SIZE - 0.2);
        heading = wrapAngle(Math.atan2(ahead.y - at2.y, ahead.x - at2.x) + (rng() < 0.5 ? 0 : Math.PI));
      } else {
        const x2 = mark.x2 ?? mark.x;
        const y2 = mark.y2 ?? mark.y;
        x = clamp2(mark.x + (x2 - mark.x) * t, 0.2, FIELD_SIZE - 0.2);
        y = clamp2(mark.y + (y2 - mark.y) * t, 0.2, FIELD_SIZE - 0.2);
        heading = wrapAngle(Math.atan2(y2 - mark.y, x2 - mark.x) + (rng() < 0.5 ? 0 : Math.PI));
      }
    } else if (translation.archetypeId === "stepped-amphitheater" && recipe.saField) {
      const at2 = spawnOnSteppedAmphitheater(recipe.saField, rng);
      x = clamp2(at2.x, 0.2, FIELD_SIZE - 0.2);
      y = clamp2(at2.y, 0.2, FIELD_SIZE - 0.2);
      heading = at2.heading;
    } else if (translation.archetypeId === "terraced" && recipe.attractors?.length) {
      const marks = recipe.attractors;
      const plates = marks.filter((item) => (item.radius ?? 0) >= TERRACE_PLATE);
      const pool = rng() < 0.9 && plates.length ? plates : marks;
      let weight = 0;
      for (const item of pool) weight += Math.max(0.04, item.mass ?? 1);
      let roll = rng() * weight;
      let mark = pool[pool.length - 1];
      for (const item of pool) {
        roll -= Math.max(0.04, item.mass ?? 1);
        if (roll <= 0) {
          mark = item;
          break;
        }
      }
      const cover = Math.max(0.08, Math.min(1, mark.cover ?? 1));
      const at2 = Math.max(0, Math.min(1 - cover, mark.coverAt ?? 0));
      const t = at2 + rng() * cover;
      if (mark.kind === "curve") {
        const at3 = pointOnCurve(mark, t);
        const ahead = pointOnCurve(mark, Math.min(1, t + 0.1));
        x = clamp2(at3.x, 0.2, FIELD_SIZE - 0.2);
        y = clamp2(at3.y, 0.2, FIELD_SIZE - 0.2);
        heading = wrapAngle(Math.atan2(ahead.y - at3.y, ahead.x - at3.x) + (rng() < 0.5 ? 0 : Math.PI));
      } else {
        const x2 = mark.x2 ?? mark.x;
        const y2 = mark.y2 ?? mark.y;
        x = clamp2(mark.x + (x2 - mark.x) * t, 0.2, FIELD_SIZE - 0.2);
        y = clamp2(mark.y + (y2 - mark.y) * t, 0.2, FIELD_SIZE - 0.2);
        heading = wrapAngle(Math.atan2(y2 - mark.y, x2 - mark.x) + (rng() < 0.5 ? 0 : Math.PI));
      }
    } else if (translation.archetypeId === "topographic-ground-field" && recipe.attractors?.length) {
      const pads = recipe.attractors.filter((item) => item.hole !== true && item.kind !== "line" && item.kind !== "curve" && item.kind !== "ring");
      const pad = pads[Math.floor(rng() * pads.length)] ?? recipe.attractors[0];
      const angle = rng() * TWO_PI2;
      const reach = Math.max(0.4, (pad.radius ?? 1.8) * 0.45) * Math.sqrt(rng());
      x = clamp2(pad.x + Math.cos(angle) * reach, 0.35, FIELD_SIZE - 0.35);
      y = clamp2(pad.y + Math.sin(angle) * reach, 0.35, FIELD_SIZE - 0.35);
      heading = rng() * TWO_PI2;
    } else if (translation.archetypeId === "flat-deep-plan" && recipe.attractors?.length) {
      const marks = recipe.attractors;
      const mark = marks[Math.floor(rng() * marks.length)] ?? marks[0];
      const t = rng();
      let atX;
      let atY;
      let dir;
      if (mark.kind === "curve") {
        const at2 = pointOnCurve(mark, t);
        const ahead = pointOnCurve(mark, Math.min(1, t + 0.08));
        atX = at2.x;
        atY = at2.y;
        dir = Math.atan2(ahead.y - at2.y, ahead.x - at2.x);
      } else {
        const x2 = mark.x2 ?? mark.x;
        const y2 = mark.y2 ?? mark.y;
        atX = mark.x + (x2 - mark.x) * t;
        atY = mark.y + (y2 - mark.y) * t;
        dir = Math.atan2(y2 - mark.y, x2 - mark.x);
      }
      if (rng() < 0.5) dir += Math.PI;
      const side = rng() < 0.5 ? 1 : -1;
      const offset = 0.28 + rng() * 0.72;
      x = clamp2(atX + Math.cos(dir + Math.PI / 2) * side * offset, 0.2, FIELD_SIZE - 0.2);
      y = clamp2(atY + Math.sin(dir + Math.PI / 2) * side * offset, 0.2, FIELD_SIZE - 0.2);
      heading = wrapAngle(dir + (rng() - 0.5) * 1.1);
    } else if (translation.archetypeId === "linear-gallery" && recipe.attractors?.length) {
      const curves = recipe.attractors.filter((item) => (item.kind === "curve" || item.kind === "line") && !item.hole);
      const strong = curves.filter((item) => (item.strength ?? 1) >= 1);
      const weak = curves.filter((item) => (item.strength ?? 1) < 1);
      const pool = rng() < 0.24 && weak.length ? weak : strong.length ? strong : curves;
      let weight = 0;
      for (const item of pool) weight += Math.max(0.05, item.strength ?? 1);
      let roll = rng() * weight;
      let mark = pool[pool.length - 1];
      for (const item of pool) {
        roll -= Math.max(0.05, item.strength ?? 1);
        if (roll <= 0) {
          mark = item;
          break;
        }
      }
      const t = 0.04 + rng() * 0.92;
      const at2 = mark.kind === "curve" ? pointOnCurve(mark, t) : {
        x: mark.x + ((mark.x2 ?? mark.x) - mark.x) * t,
        y: mark.y + ((mark.y2 ?? mark.y) - mark.y) * t
      };
      const ahead = mark.kind === "curve" ? pointOnCurve(mark, Math.min(1, t + 0.12)) : {
        x: mark.x2 ?? mark.x,
        y: mark.y2 ?? mark.y
      };
      const back = mark.kind === "curve" ? pointOnCurve(mark, Math.max(0, t - 0.12)) : { x: mark.x, y: mark.y };
      const dir = rng() < 0.5 ? ahead : back;
      const nx = -(dir.y - at2.y);
      const ny = dir.x - at2.x;
      const span4 = Math.hypot(nx, ny) || 1;
      const side = rng() < 0.5 ? 1 : -1;
      const offset = side * (0.75 + rng() * 0.65);
      x = clamp2(at2.x + nx / span4 * offset, 0.35, FIELD_SIZE - 0.35);
      y = clamp2(at2.y + ny / span4 * offset, 0.35, FIELD_SIZE - 0.35);
      heading = wrapAngle(Math.atan2(dir.y - at2.y, dir.x - at2.x));
    } else if (fineTrail(translation.archetypeId)) {
      const marks = recipe.attractors ?? [];
      let minX = FIELD_SIZE;
      let minY = FIELD_SIZE;
      let maxX = 0;
      let maxY = 0;
      for (const item of marks) {
        minX = Math.min(minX, item.x, item.x2 ?? item.x);
        minY = Math.min(minY, item.y, item.y2 ?? item.y);
        maxX = Math.max(maxX, item.x, item.x2 ?? item.x);
        maxY = Math.max(maxY, item.y, item.y2 ?? item.y);
      }
      const scatter = !marks.length || rng() >= 0.2 + recipe.clustering * 0.7;
      if (scatter) {
        const pad = 2.6;
        x = clamp2((minX < maxX ? minX : 1.6) - pad + rng() * ((maxX > minX ? maxX - minX : 16) + pad * 2), 0.2, FIELD_SIZE - 0.2);
        y = clamp2((minY < maxY ? minY : 1.6) - pad + rng() * ((maxY > minY ? maxY - minY : 16) + pad * 2), 0.2, FIELD_SIZE - 0.2);
        heading = rng() * TWO_PI2;
      } else {
        const chambers = marks.filter((item) => (item.radius ?? 1) >= 2);
        const beads = marks.filter((item) => (item.radius ?? 1) >= 0.7 && (item.radius ?? 1) < 2);
        const necks = marks.filter((item) => (item.radius ?? 1) < 0.7);
        const pool = rng() < 0.78 && chambers.length ? chambers : rng() < 0.6 && beads.length ? beads : necks.length ? necks : marks;
        const mark = pool[Math.floor(rng() * Math.max(1, pool.length))] ?? {
          x: attractor.x,
          y: attractor.y,
          x2: attractor.x,
          y2: attractor.y,
          radius: 1.2
        };
        if (mark.kind === "point" || mark.kind === "ring" || mark.x2 == null) {
          const a = rng() * TWO_PI2;
          const r = (mark.radius ?? 1.2) * rng() * 0.82;
          x = clamp2(mark.x + Math.cos(a) * r, 0.2, FIELD_SIZE - 0.2);
          y = clamp2(mark.y + Math.sin(a) * r, 0.2, FIELD_SIZE - 0.2);
          heading = rng() * TWO_PI2;
        } else {
          const t = rng();
          const x2 = mark.x2 ?? mark.x;
          const y2 = mark.y2 ?? mark.y;
          const alongX = mark.x + (x2 - mark.x) * t;
          const alongY = mark.y + (y2 - mark.y) * t;
          const nx = -(y2 - mark.y);
          const ny = x2 - mark.x;
          const span4 = Math.hypot(nx, ny) || 1;
          const offset = (mark.radius ?? 0.2) * (0.2 + rng() * 0.45);
          x = clamp2(alongX + nx / span4 * (rng() - 0.5) * offset, 0.2, FIELD_SIZE - 0.2);
          y = clamp2(alongY + ny / span4 * (rng() - 0.5) * offset, 0.2, FIELD_SIZE - 0.2);
          heading = wrapAngle(Math.atan2(y2 - mark.y, x2 - mark.x) + (rng() - 0.5) * 0.4);
        }
      }
    } else if (translation.archetypeId === "continuous-hall") {
      const marks = recipe.attractors ?? [];
      const voids = marks.filter((item) => item.hole || item.kind === "ring");
      const solids = marks.filter((item) => !item.hole && item.kind !== "ring");
      const inverted = voids.length > 0;
      const pool = inverted ? solids.length ? solids : voids : marks;
      const mark = pool[Math.floor(rng() * Math.max(1, pool.length))] ?? {
        x: attractor.x,
        y: attractor.y,
        x2: attractor.x,
        y2: attractor.y,
        radius: 1
      };
      if (!inverted && (mark.kind === "point" || mark.kind === "ring")) {
        const a = rng() * TWO_PI2;
        const r = (mark.radius ?? 1) * rng() * 0.85;
        x = clamp2(mark.x + Math.cos(a) * r, 0.2, FIELD_SIZE - 0.2);
        y = clamp2(mark.y + Math.sin(a) * r, 0.2, FIELD_SIZE - 0.2);
        heading = rng() * TWO_PI2;
      } else {
        const t = rng();
        const x2 = mark.x2 ?? mark.x;
        const y2 = mark.y2 ?? mark.y;
        const alongX = mark.x + (x2 - mark.x) * t;
        const alongY = mark.y + (y2 - mark.y) * t;
        const nx = -(y2 - mark.y);
        const ny = x2 - mark.x;
        const span4 = Math.hypot(nx, ny) || 1;
        const side = rng() < 0.5 ? 1 : -1;
        const offset = HALL_SLOT + 0.08 + rng() * (HALL_OUTER - HALL_SLOT - 0.12);
        x = clamp2(alongX + nx / span4 * side * offset, 0.2, FIELD_SIZE - 0.2);
        y = clamp2(alongY + ny / span4 * side * offset, 0.2, FIELD_SIZE - 0.2);
        heading = wrapAngle(Math.atan2(y2 - mark.y, x2 - mark.x) + (rng() - 0.5) * 1.1);
      }
    } else if (aroundAbsence(translation) && rng() > 0.05) {
      x = 1.1 + rng() * (FIELD_SIZE - 2.2);
      y = 1.1 + rng() * (FIELD_SIZE - 2.2);
      const away = dist({ x, y }, attractor);
      if (away < recipe.isolationRadius * 0.5) {
        const angle = Math.atan2(y - attractor.y, x - attractor.x) || rng() * TWO_PI2;
        const radius = recipe.isolationRadius * (0.65 + rng() * 0.5);
        x = clamp2(attractor.x + Math.cos(angle) * radius, 0.2, FIELD_SIZE - 0.2);
        y = clamp2(attractor.y + Math.sin(angle) * radius, 0.2, FIELD_SIZE - 0.2);
      }
      heading = rng() * TWO_PI2;
    } else if (translation.archetypeId === "contained-room-within-volume" && recipe.attractors?.length) {
      const field = recipe.attractors.filter((item) => item.kind === "point");
      const pool = field.length ? field : recipe.attractors.filter((item) => !item.hole);
      const collar2 = pool.filter((item) => Math.hypot(item.x - attractor.x, item.y - attractor.y) < recipe.isolationRadius + 2.4);
      const chosen = rng() < 0.38 && collar2.length ? collar2 : pool;
      const mark = chosen[Math.floor(rng() * chosen.length)] ?? pool[0];
      const angle = rng() * TWO_PI2;
      const jitter = 0.2 + rng() * 1.15;
      x = clamp2(mark.x + Math.cos(angle) * jitter, 0.35, FIELD_SIZE - 0.35);
      y = clamp2(mark.y + Math.sin(angle) * jitter, 0.35, FIELD_SIZE - 0.35);
      heading = rng() * TWO_PI2;
    } else if (containedInterior(translation) && rng() < 0.16 + recipe.clustering * 0.7) {
      const angle = rng() * TWO_PI2;
      const radius = recipe.isolationRadius * (0.18 + rng() * (1.55 + params.geometryVariation * 0.7));
      x = clamp2(attractor.x + Math.cos(angle) * radius, 0.2, FIELD_SIZE - 0.2);
      y = clamp2(attractor.y + Math.sin(angle) * radius, 0.2, FIELD_SIZE - 0.2);
      heading = rng() * TWO_PI2;
    } else if (!aroundAbsence(translation) && !containedInterior(translation) && rng() > 0.1) {
      x = 1.1 + rng() * (FIELD_SIZE - 2.2);
      y = 1.1 + rng() * (FIELD_SIZE - 2.2);
      heading = rng() * TWO_PI2;
      if (params.nodeRepetition > 0.55 && rng() < 0.35 + params.nodeRepetition * 0.25) {
        const steps = 2 + Math.round(params.nodeRepetition * 3);
        const t = Math.floor(rng() * (steps + 1)) / steps;
        const jitter = 0.8 + params.geometricDisplacement * 1.4;
        x = clamp2(
          source.x + (attractor.x - source.x) * t + (rng() - 0.5) * jitter,
          0.2,
          FIELD_SIZE - 0.2
        );
        y = clamp2(
          source.y + (attractor.y - source.y) * t + (rng() - 0.5) * jitter,
          0.2,
          FIELD_SIZE - 0.2
        );
      }
    } else {
      const invite = translation.ratings.receptivity === 0 || translation.ratings.receptivity === 1 || translation.ratings.receptivity === 2 ? (params.sourcePermeability - 0.5) * 0.7 : 0;
      const spread = 0.55 + params.geometryVariation * 0.9 + params.nodeSpacing * 0.45 + invite;
      const toward = Math.atan2(attractor.y - source.y, attractor.x - source.x);
      heading = wrapAngle(
        toward * (0.25 + params.directionalBias * 0.45) + (rng() - 0.5) * (1.2 + params.geometryVariation * 1.4)
      );
      const inward = aroundAbsence(translation) ? 0 : containedInterior(translation) ? 1.2 : 0.35;
      x = clamp2(source.x + (rng() - 0.5) * spread - Math.sign(source.x - 10) * inward, 0.15, FIELD_SIZE - 0.15);
      y = clamp2(source.y + rng() * spread * 0.7, 0.15, FIELD_SIZE - 0.15);
    }
    return {
      x,
      y,
      heading,
      speed: 0.12 + params.permeability * 0.16,
      trailStrength: 0.38 + params.flowCoupling * 0.42,
      pathX: [x],
      pathY: [y],
      hold: 0
    };
  }
  var trailBooks = /* @__PURE__ */ new WeakMap();
  function trailBook(trails) {
    let book = trailBooks.get(trails);
    if (!book || book.stamp.length !== trails.length) {
      book = { active: [], stamp: new Uint8Array(trails.length) };
      trailBooks.set(trails, book);
    }
    return book;
  }
  var trailScratch = null;
  var densityScratch = null;
  function densityFor(size) {
    const count = size * size;
    if (!densityScratch || densityScratch.length !== count) densityScratch = new Array(count).fill(0);
    else densityScratch.fill(0);
    return densityScratch;
  }
  function scratchFor(length) {
    if (!trailScratch || trailScratch.length < length) trailScratch = new Float32Array(length);
    return trailScratch;
  }
  function markTrail(trails, index2) {
    const book = trailBook(trails);
    if (book.stamp[index2]) return;
    book.stamp[index2] = 1;
    book.active.push(index2);
  }
  function deposit(trails, trailSize, point, amount, width = 1, cap = 1.8) {
    const scale = trailSize / FIELD_SIZE;
    const pixelWidth = width * (scale / TRAIL_SCALE);
    const pos = toTrail(point, scale);
    const paint2 = (x, y, weight) => {
      if (x < 0 || y < 0 || x >= trailSize || y >= trailSize || weight <= 0) return;
      const index2 = y * trailSize + x;
      trails[index2] = Math.min(cap, trails[index2] + amount * weight);
      markTrail(trails, index2);
    };
    if (pixelWidth <= 1.05) {
      const x02 = Math.floor(pos.x);
      const y02 = Math.floor(pos.y);
      for (let oy = 0; oy <= 1; oy += 1) {
        for (let ox = 0; ox <= 1; ox += 1) {
          const x = x02 + ox;
          const y = y02 + oy;
          const w = (1 - Math.abs(pos.x - x)) * (1 - Math.abs(pos.y - y));
          paint2(x, y, Math.max(0, w));
        }
      }
      return;
    }
    const span4 = Math.ceil(pixelWidth);
    const x0 = Math.floor(pos.x);
    const y0 = Math.floor(pos.y);
    const stride = pixelWidth > 8 ? 2 : 1;
    for (let oy = -span4; oy <= span4; oy += stride) {
      for (let ox = -span4; ox <= span4; ox += stride) {
        const x = x0 + ox;
        const y = y0 + oy;
        const distance = Math.hypot(pos.x - x, pos.y - y);
        if (distance > pixelWidth) continue;
        paint2(x, y, 1 - distance / pixelWidth);
      }
    }
  }
  function depositSegment(trails, trailSize, from, to, amount, width = 1, cap = 1.8) {
    const scale = trailSize / FIELD_SIZE;
    const a = toTrail(from, scale);
    const b = toTrail(to, scale);
    const span4 = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(span4));
    const share = amount / Math.sqrt(steps);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      deposit(
        trails,
        trailSize,
        {
          x: (a.x + (b.x - a.x) * t) / scale,
          y: (a.y + (b.y - a.y) * t) / scale
        },
        share,
        width,
        cap
      );
    }
  }
  function downsampleOccupancy(trails, trailSize, size) {
    const occupancy = new Array(size * size).fill(0);
    const scale = trailSize / size;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let sum = 0;
        let count = 0;
        const x0 = Math.floor(x * scale);
        const y0 = Math.floor(y * scale);
        const x1 = Math.min(trailSize, Math.floor((x + 1) * scale));
        const y1 = Math.min(trailSize, Math.floor((y + 1) * scale));
        for (let ty = y0; ty < y1; ty += 1) {
          for (let tx = x0; tx < x1; tx += 1) {
            sum += trails[ty * trailSize + tx];
            count += 1;
          }
        }
        occupancy[y * size + x] = count ? sum / count : 0;
      }
    }
    return occupancy;
  }
  function createSimulation(translation, seed, agentCount = DEFAULT_AGENT_COUNT, trailScale = TRAIL_SCALE) {
    const size = FIELD_SIZE;
    const trailSize = size * Math.max(1, Math.round(trailScale));
    const rng = mulberry32(seed);
    const source = sourceFromCorner(translation.recipe.sourceCorner, size);
    const attractor = translation.recipe.attractorFixed ? translation.recipe.attractor : attractorFromRatings(translation, size);
    const count = clamp2(Math.round(agentCount), MIN_AGENT_COUNT, MAX_AGENT_COUNT);
    const agents = Array.from(
      { length: count },
      () => spawnAgent(source, attractor, translation, rng)
    );
    return {
      size,
      trailSize,
      iteration: 0,
      maxIterations: MAX_ITERATIONS,
      converged: false,
      streak: 0,
      totalDelta: 0,
      seed,
      source,
      attractor,
      attraction: buildAttractionField(size, attractor, translation),
      permeabilityField: buildPermeabilityField(size, source, attractor, translation),
      occupancy: new Array(size * size).fill(0),
      trails: new Array(trailSize * trailSize).fill(0),
      displayTrails: new Float32Array(trailSize * trailSize),
      flow: new Array(size * size).fill(0),
      agents
    };
  }
  function stepSimulation(state2, translation, rng, trailDecay = 0.986, slime, finalize = true, recordPaths = true) {
    if (state2.converged || state2.iteration >= state2.maxIterations) return state2;
    if (slime && aroundAbsence(translation)) {
      state2.attraction = buildAttractionField(state2.size, state2.attractor, translation, slime);
    }
    const { params } = translation;
    const sensorAngle = slime?.sensorAngle ?? 0.32 + params.geometryVariation * 0.45;
    const sensorDistance = slime?.sensorDistance ?? 0.45 + params.influenceRadius * 0.035 + params.scaleVariation * 0.25;
    const turnAngle = slime?.turnAngle ?? 0.22 + params.geometryVariation * 0.55;
    const cohesionMul = aroundAbsence(translation) ? 0.48 : containedInterior(translation) ? 0.74 : 0.38 + params.nodeInteraction * 0.24 + translation.recipe.clustering * 0.16;
    const cohesion = clamp2(1 - params.nodeSpacing, 0, 1) * cohesionMul;
    const decayMul = HAIR_DECAY;
    const foods = slime?.foodPoints;
    const density = densityFor(state2.size);
    for (const agent of state2.agents) {
      const ix = clamp2(Math.round(agent.x), 0, state2.size - 1);
      const iy = clamp2(Math.round(agent.y), 0, state2.size - 1);
      density[iy * state2.size + ix] += 1;
    }
    let trailDelta = 0;
    state2.flow.fill(0);
    for (const agent of state2.agents) {
      keepOutsideCircles(agent, agent.x, agent.y, translation, state2.size, slime);
      const here = { x: agent.x, y: agent.y };
      const holdHeading = slime != null && agent.hold > 0;
      if (holdHeading) agent.hold -= 1;
      if (!holdHeading) {
        const forward = sense(here, agent.heading, sensorDistance, state2.trails, state2.trailSize, translation, state2, foods, slime);
        const left = sense(here, agent.heading + sensorAngle, sensorDistance, state2.trails, state2.trailSize, translation, state2, foods, slime);
        const right = sense(here, agent.heading - sensorAngle, sensorDistance, state2.trails, state2.trailSize, translation, state2, foods, slime);
        if (left > forward && left > right) agent.heading += turnAngle;
        else if (right > forward && right > left) agent.heading -= turnAngle;
        else {
          const wander = 0.14 + params.geometryVariation * 1.2 + (aroundAbsence(translation) || containedInterior(translation) ? 0 : params.geometricDisplacement * 0.35);
          agent.heading += (rng() - 0.5) * wander;
        }
        if (slime && rng() < slime.persistence) {
          agent.hold = 1 + Math.floor(slime.persistence * 5);
        }
      }
      if (slime && slime.randomness > 0) {
        agent.heading += (rng() - 0.5) * slime.randomness * Math.PI;
      }
      if (cohesion > 2e-3) {
        const ix2 = clamp2(Math.round(agent.x), 0, state2.size - 1);
        const iy2 = clamp2(Math.round(agent.y), 0, state2.size - 1);
        let best = density[iy2 * state2.size + ix2];
        let bx = 0;
        let by = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            const nx = ix2 + ox;
            const ny = iy2 + oy;
            if (nx < 0 || ny < 0 || nx >= state2.size || ny >= state2.size) continue;
            const value = density[ny * state2.size + nx];
            if (value > best) {
              best = value;
              bx = ox;
              by = oy;
            }
          }
        }
        if (bx !== 0 || by !== 0) {
          agent.heading = wrapAngle(agent.heading * (1 - cohesion) + Math.atan2(by, bx) * cohesion);
        }
      }
      const dirPull = translation.archetypeId === "linear-edge-gallery" ? 0.03 : params.directionalBias * 0.28;
      if (dirPull > 0.01) {
        const target = nearestAttractorPoint(agent, state2.attractor, translation, agent.heading);
        const toward = Math.atan2(target.y - agent.y, target.x - agent.x);
        agent.heading = wrapAngle(agent.heading * (1 - dirPull) + toward * dirPull);
      }
      const ix = clamp2(Math.round(agent.x), 0, state2.size - 1);
      const iy = clamp2(Math.round(agent.y), 0, state2.size - 1);
      if (slime && density[iy * state2.size + ix] > slime.crowdingLimit) {
        agent.heading = wrapAngle(agent.heading + (rng() > 0.5 ? 1 : -1) * (Math.PI / 2));
      }
      if (translation.archetypeId === "stepped-amphitheater" && translation.recipe.saField) {
        steerSteppedAmphitheater(agent, translation.recipe.saField, rng);
      }
      if (translation.archetypeId === "inserted-horizontal-plate") guidePlate(agent, translation);
      if (translation.archetypeId === "undulated") guideUndulated(agent, translation);
      if (translation.archetypeId === "continuous-hall") guideHall(agent, translation);
      if (translation.archetypeId === "linear-gallery") holdLinearGallery(agent, translation);
      const stepBase = slime?.stepSize ?? agent.speed * (0.7 + params.permeability * 0.35);
      const resistance = sampleResistance(agent, state2.size, slime?.resistance ?? 0);
      const step = stepBase * (1 - resistance * 0.82);
      const fromX = agent.x;
      const fromY = agent.y;
      agent.x += Math.cos(agent.heading) * step;
      agent.y += Math.sin(agent.heading) * step;
      if (translation.archetypeId === "inserted-horizontal-plate") {
        const near = nearestUndulated(agent, translation);
        if (near && near.d > PLATE_BODY) {
          const keep = PLATE_BODY / near.d;
          agent.x = near.px + (agent.x - near.px) * keep;
          agent.y = near.py + (agent.y - near.py) * keep;
        }
      }
      if (translation.archetypeId === "undulated") {
        const near = nearestUndulated(agent, translation);
        if (near && near.d > UNDULATED_PATH) {
          const keep = UNDULATED_PATH / near.d;
          agent.x = near.px + (agent.x - near.px) * keep;
          agent.y = near.py + (agent.y - near.py) * keep;
        }
      }
      if (translation.archetypeId === "continuous-hall") {
        const near = nearestUndulated(agent, translation);
        if (near && near.d < HALL_SLOT) {
          const push = (HALL_SLOT + 0.12) / Math.max(near.d, 0.05);
          agent.x = near.px + (agent.x - near.px) * push;
          agent.y = near.py + (agent.y - near.py) * push;
        } else if (near && near.d > HALL_OUTER) {
          const keep = HALL_OUTER / near.d;
          agent.x = near.px + (agent.x - near.px) * keep;
          agent.y = near.py + (agent.y - near.py) * keep;
        }
      }
      if (translation.archetypeId === "void-field") {
        const near = nearestVoidCirculation(agent, translation);
        if (!near || near.d > 2.2) {
          const fresh = spawnAgent(state2.source, state2.attractor, translation, rng);
          agent.x = fresh.x;
          agent.y = fresh.y;
          agent.heading = fresh.heading;
        }
      }
      if (translation.archetypeId === "contained-room-within-volume") {
        const near = nearestContainedField(agent, translation);
        if (near && near.d > 3.3) {
          agent.x += (near.px - agent.x) * 0.2;
          agent.y += (near.py - agent.y) * 0.2;
        }
      }
      if (translation.archetypeId === "terraced") holdTerraced(agent, translation, slime);
      if (translation.archetypeId === "flat-deep-plan") guideFlatDeep(agent, translation);
      const galleryHeld = translation.archetypeId === "linear-gallery" ? holdLinearGallery(agent, translation) : null;
      if (translation.archetypeId === "stepped-amphitheater" && translation.recipe.saField) {
        containSteppedAmphitheater(agent, translation.recipe.saField);
      }
      if (translation.archetypeId === "topographic-ground-field") {
        const pad = nearestGroundPad(agent, translation);
        if (pad && pad.d > pad.radius * 0.98) {
          const pull = Math.min(0.4, (pad.d - pad.radius * 0.98) * 0.45);
          agent.x += (pad.x - agent.x) / pad.d * pull;
          agent.y += (pad.y - agent.y) / pad.d * pull;
        }
      }
      if (aroundAbsence(translation) && translation.archetypeId !== "void-field") {
        const coreDist = dist(agent, state2.attractor);
        const angle = Math.atan2(agent.y - state2.attractor.y, agent.x - state2.attractor.x) || rng() * TWO_PI2;
        const wobble = 1 + 0.16 * Math.cos(angle * 2.15) + 0.09 * Math.cos(angle * 5.4 + 0.6);
        const opening = 0.5 + 0.5 * Math.cos(angle * 2.05 + 0.4);
        const keepOut = slime ? voidRadius(angle, translation.recipe.isolationRadius * 0.48, slime) : translation.recipe.isolationRadius * 0.48 * wobble * (0.42 + 0.58 * opening);
        if (coreDist < keepOut) {
          const radius = keepOut + 0.12;
          agent.x = clamp2(state2.attractor.x + Math.cos(angle) * radius, 0.18, state2.size - 0.18);
          agent.y = clamp2(state2.attractor.y + Math.sin(angle) * radius, 0.18, state2.size - 0.18);
          agent.heading = wrapAngle(angle + (rng() - 0.5) * 0.5);
        }
      }
      keepOutsideCircles(agent, fromX, fromY, translation, state2.size, slime);
      if (translation.archetypeId === "void-field" && pressedAgainstVoid(agent, translation, slime)) {
        const fresh = spawnAgent(state2.source, state2.attractor, translation, rng);
        agent.x = fresh.x;
        agent.y = fresh.y;
        agent.heading = fresh.heading;
      }
      const hitWall = agent.x < 0.18 || agent.x > state2.size - 0.18 || agent.y < 0.18 || agent.y > state2.size - 0.18;
      if (hitWall) {
        const fresh = spawnAgent(state2.source, state2.attractor, translation, rng);
        agent.x = fresh.x;
        agent.y = fresh.y;
        agent.heading = fresh.heading;
        if (recordPaths) {
          agent.pathX = [fresh.x];
          agent.pathY = [fresh.y];
        }
      } else {
        if (agent.x < 0.18 || agent.x > state2.size - 0.18) {
          agent.x = clamp2(agent.x, 0.18, state2.size - 0.18);
          agent.heading = wrapAngle((agent.x < 1 ? 0 : Math.PI) + (rng() - 0.5) * 0.9);
        }
        if (agent.y < 0.18 || agent.y > state2.size - 0.18) {
          agent.y = clamp2(agent.y, 0.18, state2.size - 0.18);
          agent.heading = wrapAngle((agent.y < 1 ? Math.PI / 2 : -Math.PI / 2) + (rng() - 0.5) * 0.9);
        }
      }
      const cell = fieldIndex(
        clamp2(Math.round(agent.x), 0, state2.size - 1),
        clamp2(Math.round(agent.y), 0, state2.size - 1),
        state2.size
      );
      state2.flow[cell] += 1;
      let depositAmount = slime?.deposit ?? (0.05 + params.flowCoupling * 0.1) * agent.trailStrength;
      let steppedInk = null;
      if (translation.archetypeId === "stepped-amphitheater" && translation.recipe.saField) {
        steppedInk = inkSteppedAmphitheater(agent, translation.recipe.saField);
        depositAmount = steppedInk.amount;
      }
      if (translation.archetypeId === "linear-gallery" && (!galleryHeld || galleryHeld.d < galleryHeld.slot || galleryHeld.d > galleryHeld.band)) {
        depositAmount = 0;
      }
      const edge = Math.min(agent.x, agent.y, state2.size - agent.x, state2.size - agent.y);
      if (edge < 2.6 && !fineTrail(translation.archetypeId) && translation.archetypeId !== "undulated" && translation.archetypeId !== "stepped-amphitheater" && translation.archetypeId !== "contained-room-within-volume") {
        depositAmount *= 0.012;
      }
      if (insideAttractorHole(agent, translation, slime)) depositAmount = 0;
      if (translation.archetypeId === "linear-edge-gallery" && insideAttractorHole({ x: fromX, y: fromY }, translation, slime)) {
        depositAmount = 0;
      }
      if (translation.archetypeId === "vertical-void") {
        const voids = translation.recipe.attractors;
        if (voids) {
          for (const item of voids) {
            if (item.kind === "line" || item.kind === "curve") continue;
            if (item.hole !== true && item.kind !== "ring") continue;
            const radius = polarVoidRadius(item, agent, slime);
            if (radius <= 0) continue;
            const angle = Math.atan2(agent.y - item.y, agent.x - item.x);
            if (Math.hypot(agent.x - item.x, agent.y - item.y) < verticalVoidReach(angle, radius)) {
              depositAmount = 0;
              break;
            }
          }
        }
      }
      if (translation.archetypeId === "void-field") {
        const near = nearestVoidCirculation(agent, translation);
        if (!near || near.d > 1.55) depositAmount = 0;
      }
      if (translation.archetypeId === "topographic-ground-field") {
        const pad = nearestGroundPad(agent, translation);
        if (!pad || pad.d > pad.radius) depositAmount = 0;
      }
      if (translation.archetypeId === "flat-deep-plan" && !onFlatDeepWall(agent, translation)) depositAmount = 0;
      if (translation.archetypeId === "contained-room-within-volume") {
        const near = nearestContainedField(agent, translation);
        if (!near || near.d > 3.15) depositAmount = 0;
        else {
          const coreD = Math.hypot(agent.x - state2.attractor.x, agent.y - state2.attractor.y);
          const rim = Math.max(1.4, translation.recipe.isolationRadius);
          const outside = coreD - rim;
          if (outside > 0 && outside < 1.6) depositAmount *= 1.65;
        }
      }
      if (translation.archetypeId === "inserted-horizontal-plate") {
        const near = nearestUndulated(agent, translation);
        if (!near || near.d > PLATE_BODY) depositAmount = 0;
      }
      if (translation.archetypeId === "undulated") {
        const near = nearestUndulated(agent, translation);
        if (!near || near.d > UNDULATED_PATH) depositAmount = 0;
      }
      if (translation.archetypeId === "continuous-hall") {
        const near = hallContact(agent, translation);
        if (!near || near.d < 0.12 || near.d > 2.3) depositAmount = 0;
        else if (near.tip && (near.along < 0.05 || near.along > 0.95)) depositAmount = 0;
        else if (near.d < 0.85) {
          const salt = Math.abs(Math.sin(agent.x * 3.1 + agent.y * 8.7) * Math.sin(agent.x * 11.2 - agent.y * 1.9));
          if (salt > near.d * 0.7) depositAmount = 0;
        }
      }
      if (translation.archetypeId === "terraced" && !onTerracedPlate(agent, translation)) {
        depositAmount = 0;
      }
      if (aroundAbsence(translation) && translation.archetypeId !== "void-field") {
        const angle = Math.atan2(agent.y - state2.attractor.y, agent.x - state2.attractor.x);
        const limit = slime ? voidRadius(angle, translation.recipe.isolationRadius * 0.55, slime) : translation.recipe.isolationRadius * 0.55;
        if (dist(agent, state2.attractor) < limit) depositAmount *= 0.05;
      }
      const depositWidth = HAIR_WIDTH;
      const depositCap = HAIR_CAP;
      const paint2 = depositAmount > 0 ? translation.archetypeId === "void-edge" ? HAIR_DEPOSIT * 0.55 : HAIR_DEPOSIT : 0;
      const traveled = dist({ x: fromX, y: fromY }, agent);
      const joinTrail = translation.archetypeId !== "compressed-sequential" || depositWidth < 28;
      if (joinTrail && !hitWall && traveled <= step * 1.75 + 0.02) {
        depositSegment(
          state2.trails,
          state2.trailSize,
          { x: fromX, y: fromY },
          agent,
          paint2,
          depositWidth,
          depositCap
        );
      } else {
        deposit(state2.trails, state2.trailSize, agent, paint2, depositWidth, depositCap);
      }
      if (rng() < (aroundAbsence(translation) ? 4e-4 : containedInterior(translation) ? 15e-4 : 9e-4)) {
        const fresh = spawnAgent(state2.source, state2.attractor, translation, rng);
        agent.x = fresh.x;
        agent.y = fresh.y;
        agent.heading = fresh.heading;
        if (recordPaths) {
          agent.pathX = [fresh.x];
          agent.pathY = [fresh.y];
        }
      } else if (recordPaths) {
        agent.pathX.push(agent.x);
        agent.pathY.push(agent.y);
        if (agent.pathX.length > PATH_LENGTH) {
          agent.pathX.shift();
          agent.pathY.shift();
        }
      }
    }
    const book = trailBook(state2.trails);
    let write = 0;
    for (let n = 0; n < book.active.length; n += 1) {
      const i = book.active[n];
      if (state2.displayTrails) state2.displayTrails[i] = Math.max(state2.displayTrails[i], state2.trails[i]);
      const faded = state2.trails[i] * decayMul;
      trailDelta += Math.abs(state2.trails[i] - faded);
      if (faded > 3e-3) {
        state2.trails[i] = faded;
        book.active[write] = i;
        write += 1;
      } else {
        state2.trails[i] = 0;
        book.stamp[i] = 0;
      }
    }
    book.active.length = write;
    const leak = 0.03 + params.networkDensity * 0.12;
    const pack3 = clamp2(1 - params.nodeSpacing, 0, 1);
    const slimeMix = slime?.diffusion ?? -1;
    if (slimeMix > 1e-3 || !slime && (params.networkDensity > 0.35 || pack3 > 0.55)) {
      const mix2 = slime ? slimeMix : params.networkDensity > 0.35 ? leak : 0.018 + pack3 * 0.025;
      const size = state2.trailSize;
      const trails = state2.trails;
      const seen = book.stamp;
      const queued = [];
      const queue = (index2) => {
        if (index2 < 0 || index2 >= trails.length || seen[index2] === 2) return;
        seen[index2] = 2;
        queued.push(index2);
      };
      for (let n = 0; n < book.active.length; n += 1) {
        const i = book.active[n];
        queue(i);
        const x = i % size;
        if (x > 0) queue(i - 1);
        if (x < size - 1) queue(i + 1);
        if (i >= size) queue(i - size);
        if (i < trails.length - size) queue(i + size);
      }
      const previous2 = scratchFor(trails.length);
      for (let n = 0; n < queued.length; n += 1) previous2[queued[n]] = trails[queued[n]];
      const read = (index2) => seen[index2] === 2 ? previous2[index2] : trails[index2];
      for (let n = 0; n < queued.length; n += 1) {
        const i = queued[n];
        const x = i % size;
        const left = x > 0 ? read(i - 1) : previous2[i];
        const right = x < size - 1 ? read(i + 1) : previous2[i];
        const up = i >= size ? read(i - size) : previous2[i];
        const down = i < trails.length - size ? read(i + size) : previous2[i];
        trails[i] = previous2[i] * (1 - mix2) + (left + right + up + down) * 0.25 * mix2;
      }
      let write2 = 0;
      for (let n = 0; n < queued.length; n += 1) {
        const i = queued[n];
        if (trails[i] > 3e-3) {
          seen[i] = 1;
          queued[write2] = i;
          write2 += 1;
        } else {
          trails[i] = 0;
          seen[i] = 0;
        }
      }
      queued.length = write2;
      book.active = queued;
    }
    eraseTrailsInsideCircles(state2.trails, state2.trailSize, state2.size, translation, slime);
    if (finalize) state2.occupancy = downsampleOccupancy(state2.trails, state2.trailSize, state2.size);
    state2.iteration += 1;
    state2.totalDelta = trailDelta / Math.max(1, state2.agents.length);
    if (state2.iteration >= CONVERGENCE_MIN_ITERATIONS && state2.totalDelta < CONVERGENCE_EPSILON) {
      state2.streak += 1;
    } else if (state2.iteration >= CONVERGENCE_MIN_ITERATIONS) {
      state2.streak = 0;
    }
    state2.converged = state2.streak >= CONVERGENCE_STREAK || state2.iteration >= state2.maxIterations;
    return state2;
  }
  function stepMany(state2, translation, rng, count, trailDecay = 0.986, slime, recordPaths = true) {
    let next = state2;
    for (let i = 0; i < count; i += 1) {
      if (next.converged) break;
      next = stepSimulation(next, translation, rng, trailDecay, slime, i === count - 1, recordPaths);
    }
    return next;
  }
  function captureSnapshot(state2, lite = false) {
    return {
      iteration: state2.iteration,
      size: state2.size,
      trailSize: state2.trailSize,
      trails: state2.trails.slice(),
      occupancy: lite ? [] : state2.occupancy.slice(),
      agents: lite ? [] : state2.agents.map((agent) => ({ x: agent.x, y: agent.y })),
      paths: lite ? [] : state2.agents.map((agent) => ({
        x: agent.pathX.slice(),
        y: agent.pathY.slice()
      })),
      source: { ...state2.source },
      attractor: { ...state2.attractor }
    };
  }

  // lib/skill1/run-compressed-sequential.ts
  var CENTER2 = (FIELD_SIZE - 1) / 2;
  var EDGE = 1.35;
  var lim = (value) => Math.min(FIELD_SIZE - EDGE, Math.max(EDGE, value));
  var SEQUENCE_FAMILIES = [
    "dumbbell-h",
    "dumbbell-v",
    "dumbbell-d",
    "zigzag-h",
    "zigzag-v",
    "serpentine",
    "beads-diag",
    "beads-vert",
    "y-axis",
    "y-axis",
    "l-path"
  ];
  var GROWTH_MODES = [
    "mass-beads",
    "filament-web",
    "soft-bloom",
    "sharp-trace",
    "heavy-mass",
    "line-rooms",
    "curve-rooms",
    "point-cluster",
    "mixed-marks",
    "sparse-field",
    "dense-pack",
    "wander",
    "committed",
    "weak-pull",
    "strong-pull",
    "wide-sensors",
    "micro-step",
    "decay-fast",
    "decay-slow",
    "asymmetric-mix"
  ];
  var GROWTH_SPECS = {
    "mass-beads": {
      chamber: "point",
      neck: "line",
      agents: [380, 460],
      origin: [-1.2, 1.2],
      scale: [0.97, 1.03],
      clustering: [0.55, 0.72],
      isolation: [2.2, 3.2],
      approach: [1.1, 1.6],
      exposure: [0.28, 0.45],
      slime: {
        persistence: [0.7, 0.84],
        trailInfluence: [1.2, 1.6],
        sensorAngle: [0.16, 0.28],
        sensorDistance: [0.45, 0.75],
        turnAngle: [0.14, 0.24],
        stepSize: [0.12, 0.17],
        deposit: [0.07, 0.11],
        depositWidth: [0.9, 1.15],
        diffusion: [6e-3, 0.014],
        decay: [0.978, 0.988],
        resistance: [0.14, 0.26],
        randomness: [0.05, 0.12],
        trailCap: [1.1, 1.4]
      },
      params: { attractionStrength: 0.72, networkDensity: 0.48, permeability: 0.42, flowCoupling: 0.55 }
    },
    "filament-web": {
      chamber: "point",
      neck: "curve",
      agents: [460, 520],
      origin: [-2.4, 2.4],
      scale: [0.92, 1.06],
      clustering: [0.18, 0.34],
      isolation: [3.4, 5.2],
      approach: [2.4, 3.6],
      exposure: [0.62, 0.88],
      slime: {
        persistence: [0.22, 0.42],
        trailInfluence: [0.35, 0.7],
        sensorAngle: [0.55, 0.95],
        sensorDistance: [0.9, 1.5],
        turnAngle: [0.45, 0.85],
        stepSize: [0.2, 0.32],
        deposit: [0.03, 0.06],
        depositWidth: [0.85, 1.05],
        diffusion: [0.02, 0.05],
        decay: [0.96, 0.975],
        resistance: [0.02, 0.12],
        randomness: [0.42, 0.78],
        trailCap: [0.7, 1.05]
      },
      params: { attractionStrength: 0.38, networkDensity: 0.72, permeability: 0.78, geometryVariation: 0.82, randomness: 0.22 }
    },
    "soft-bloom": {
      chamber: "point",
      neck: "curve",
      agents: [240, 320],
      origin: [-1.8, 1.8],
      scale: [0.88, 1.02],
      clustering: [0.6, 0.82],
      isolation: [2.8, 4],
      approach: [2, 3.2],
      exposure: [0.7, 0.92],
      slime: {
        persistence: [0.4, 0.62],
        trailInfluence: [0.8, 1.2],
        sensorAngle: [0.28, 0.5],
        sensorDistance: [0.7, 1.2],
        turnAngle: [0.22, 0.4],
        stepSize: [0.16, 0.24],
        deposit: [0.1, 0.16],
        depositWidth: [2.1, 3.2],
        diffusion: [0.12, 0.24],
        decay: [0.984, 0.994],
        resistance: [0.04, 0.16],
        randomness: [0.12, 0.28],
        trailCap: [1.3, 1.7]
      },
      params: { attractionStrength: 0.58, networkDensity: 0.36, permeability: 0.7, scaleVariation: 0.78 }
    },
    "sharp-trace": {
      chamber: "point",
      neck: "line",
      agents: [180, 260],
      origin: [-2.8, 2.8],
      scale: [0.9, 1.05],
      clustering: [0.22, 0.4],
      isolation: [3.6, 5.4],
      approach: [0.8, 1.3],
      exposure: [0.2, 0.38],
      slime: {
        persistence: [0.8, 0.9],
        trailInfluence: [1.5, 1.9],
        sensorAngle: [0.08, 0.16],
        sensorDistance: [0.28, 0.48],
        turnAngle: [0.06, 0.14],
        stepSize: [0.09, 0.13],
        deposit: [0.028, 0.05],
        depositWidth: [0.82, 0.98],
        diffusion: [0, 4e-3],
        decay: [0.948, 0.962],
        resistance: [0.22, 0.4],
        randomness: [0.02, 0.07],
        trailCap: [0.55, 0.85]
      },
      params: { attractionStrength: 0.82, networkDensity: 0.22, permeability: 0.28, directionalBias: 0.78 }
    },
    "heavy-mass": {
      chamber: "point",
      neck: "line",
      agents: [480, 560],
      origin: [-1, 1],
      scale: [0.98, 1.06],
      clustering: [0.7, 0.9],
      isolation: [1.8, 2.6],
      approach: [1.6, 2.4],
      exposure: [0.18, 0.34],
      slime: {
        persistence: [0.62, 0.8],
        trailInfluence: [1.4, 1.85],
        sensorAngle: [0.12, 0.22],
        sensorDistance: [0.4, 0.7],
        turnAngle: [0.1, 0.2],
        stepSize: [0.11, 0.16],
        deposit: [0.16, 0.22],
        depositWidth: [1.6, 2.4],
        diffusion: [0.01, 0.03],
        decay: [0.988, 0.996],
        resistance: [0.28, 0.5],
        randomness: [0.04, 0.1],
        trailCap: [1.5, 1.8]
      },
      params: { attractionStrength: 0.88, networkDensity: 0.62, flowCoupling: 0.82, permeability: 0.32 }
    },
    "line-rooms": {
      chamber: "stroke",
      neck: "line",
      agents: [320, 420],
      origin: [-2, 2],
      scale: [0.94, 1.04],
      clustering: [0.4, 0.6],
      isolation: [2.4, 3.6],
      approach: [1.2, 2],
      exposure: [0.34, 0.55],
      slime: {
        persistence: [0.66, 0.82],
        trailInfluence: [1.15, 1.55],
        sensorAngle: [0.14, 0.26],
        sensorDistance: [0.5, 0.85],
        turnAngle: [0.12, 0.22],
        stepSize: [0.12, 0.18],
        deposit: [0.08, 0.13],
        depositWidth: [1.05, 1.4],
        diffusion: [8e-3, 0.02],
        decay: [0.976, 0.988],
        resistance: [0.12, 0.28],
        randomness: [0.06, 0.16],
        trailCap: [1.1, 1.45]
      },
      params: { attractionStrength: 0.68, directionalBias: 0.72, geometryVariation: 0.28, networkDensity: 0.4 }
    },
    "curve-rooms": {
      chamber: "arc",
      neck: "curve",
      agents: [300, 400],
      origin: [-2.2, 2.2],
      scale: [0.9, 1.05],
      clustering: [0.36, 0.58],
      isolation: [2.6, 4],
      approach: [1.5, 2.6],
      exposure: [0.4, 0.66],
      slime: {
        persistence: [0.55, 0.75],
        trailInfluence: [1.05, 1.5],
        sensorAngle: [0.22, 0.4],
        sensorDistance: [0.55, 1],
        turnAngle: [0.2, 0.36],
        stepSize: [0.13, 0.2],
        deposit: [0.07, 0.12],
        depositWidth: [1.1, 1.55],
        diffusion: [0.01, 0.028],
        decay: [0.974, 0.986],
        resistance: [0.08, 0.22],
        randomness: [0.1, 0.24],
        trailCap: [1.05, 1.4]
      },
      params: { attractionStrength: 0.64, geometryVariation: 0.7, geometricDisplacement: 0.62, directionalBias: 0.32 }
    },
    "point-cluster": {
      chamber: "point",
      neck: "dots",
      agents: [360, 460],
      origin: [-2.6, 2.6],
      scale: [0.93, 1.05],
      clustering: [0.48, 0.7],
      isolation: [2.2, 3.8],
      approach: [1.8, 3],
      exposure: [0.5, 0.75],
      slime: {
        persistence: [0.35, 0.58],
        trailInfluence: [0.7, 1.2],
        sensorAngle: [0.3, 0.55],
        sensorDistance: [0.6, 1.1],
        turnAngle: [0.24, 0.45],
        stepSize: [0.14, 0.22],
        deposit: [0.05, 0.09],
        depositWidth: [0.95, 1.3],
        diffusion: [0.015, 0.04],
        decay: [0.968, 0.982],
        resistance: [0.06, 0.2],
        randomness: [0.18, 0.38],
        trailCap: [0.9, 1.25]
      },
      params: { attractionStrength: 0.52, nodeRepetition: 0.78, networkDensity: 0.58, nodeSpacing: 0.32 }
    },
    "mixed-marks": {
      chamber: "mixed",
      neck: "mixed",
      agents: [340, 450],
      origin: [-2.8, 2.8],
      scale: [0.9, 1.06],
      clustering: [0.3, 0.62],
      isolation: [2.4, 4.4],
      approach: [1.2, 2.8],
      exposure: [0.32, 0.7],
      slime: {
        persistence: [0.4, 0.72],
        trailInfluence: [0.6, 1.5],
        sensorAngle: [0.18, 0.55],
        sensorDistance: [0.4, 1.2],
        turnAngle: [0.14, 0.5],
        stepSize: [0.11, 0.24],
        deposit: [0.05, 0.14],
        depositWidth: [0.9, 2.2],
        diffusion: [4e-3, 0.08],
        decay: [0.96, 0.99],
        resistance: [0.05, 0.35],
        randomness: [0.08, 0.4],
        trailCap: [0.8, 1.55]
      },
      params: { attractionStrength: 0.6, geometryVariation: 0.74, scaleVariation: 0.7, networkDensity: 0.5 }
    },
    "sparse-field": {
      chamber: "point",
      neck: "line",
      agents: [140, 220],
      origin: [-3.2, 3.2],
      scale: [0.82, 0.98],
      clustering: [0.12, 0.28],
      isolation: [4.4, 6.2],
      approach: [0.7, 1.2],
      exposure: [0.55, 0.82],
      slime: {
        persistence: [0.72, 0.88],
        trailInfluence: [1.3, 1.8],
        sensorAngle: [0.1, 0.2],
        sensorDistance: [0.7, 1.3],
        turnAngle: [0.08, 0.18],
        stepSize: [0.14, 0.22],
        deposit: [0.06, 0.1],
        depositWidth: [1, 1.35],
        diffusion: [4e-3, 0.016],
        decay: [0.97, 0.984],
        resistance: [0.08, 0.2],
        randomness: [0.04, 0.12],
        trailCap: [1, 1.35]
      },
      params: { attractionStrength: 0.9, networkDensity: 0.18, nodeSpacing: 0.78, permeability: 0.55 }
    },
    "dense-pack": {
      chamber: "point",
      neck: "curve",
      agents: [500, 580],
      origin: [-0.8, 0.8],
      scale: [1, 1.08],
      clustering: [0.78, 0.94],
      isolation: [1.4, 2.2],
      approach: [2.2, 3.6],
      exposure: [0.22, 0.4],
      slime: {
        persistence: [0.5, 0.7],
        trailInfluence: [1.1, 1.6],
        sensorAngle: [0.2, 0.36],
        sensorDistance: [0.4, 0.7],
        turnAngle: [0.16, 0.3],
        stepSize: [0.11, 0.16],
        deposit: [0.1, 0.16],
        depositWidth: [1.25, 1.8],
        diffusion: [0.02, 0.05],
        decay: [0.982, 0.992],
        resistance: [0.18, 0.36],
        randomness: [0.1, 0.22],
        trailCap: [1.25, 1.65]
      },
      params: { attractionStrength: 0.7, networkDensity: 0.86, nodeRepetition: 0.72, permeability: 0.36 }
    },
    wander: {
      chamber: "point",
      neck: "curve",
      agents: [380, 480],
      origin: [-2.6, 2.6],
      scale: [0.9, 1.06],
      clustering: [0.16, 0.36],
      isolation: [3.2, 5],
      approach: [2.6, 4],
      exposure: [0.6, 0.85],
      slime: {
        persistence: [0.12, 0.32],
        trailInfluence: [0.25, 0.65],
        sensorAngle: [0.75, 1.25],
        sensorDistance: [1.1, 2],
        turnAngle: [0.55, 1.05],
        stepSize: [0.22, 0.38],
        deposit: [0.04, 0.08],
        depositWidth: [1.1, 1.8],
        diffusion: [0.04, 0.1],
        decay: [0.955, 0.972],
        resistance: [0, 0.1],
        randomness: [0.55, 1.05],
        trailCap: [0.65, 1.05]
      },
      params: { attractionStrength: 0.32, geometryVariation: 0.9, geometricDisplacement: 0.82, randomness: 0.22, directionalBias: 0.18 }
    },
    committed: {
      chamber: "stroke",
      neck: "line",
      agents: [220, 320],
      origin: [-1.6, 1.6],
      scale: [0.95, 1.04],
      clustering: [0.52, 0.7],
      isolation: [2.6, 3.8],
      approach: [0.9, 1.5],
      exposure: [0.24, 0.42],
      slime: {
        persistence: [0.84, 0.9],
        trailInfluence: [1.6, 2],
        sensorAngle: [0.08, 0.14],
        sensorDistance: [0.32, 0.55],
        turnAngle: [0.05, 0.12],
        stepSize: [0.1, 0.15],
        deposit: [0.06, 0.1],
        depositWidth: [0.88, 1.15],
        diffusion: [0, 8e-3],
        decay: [0.972, 0.986],
        resistance: [0.2, 0.38],
        randomness: [0.01, 0.06],
        trailCap: [1.05, 1.35]
      },
      params: { attractionStrength: 0.84, directionalBias: 0.88, persistence: 0.86, geometryVariation: 0.16 }
    },
    "weak-pull": {
      chamber: "point",
      neck: "curve",
      agents: [300, 400],
      origin: [-3, 3],
      scale: [0.88, 1.04],
      clustering: [0.14, 0.3],
      isolation: [4, 5.8],
      approach: [2.8, 4.2],
      exposure: [0.66, 0.9],
      slime: {
        persistence: [0.28, 0.5],
        trailInfluence: [0.15, 0.45],
        sensorAngle: [0.4, 0.75],
        sensorDistance: [0.8, 1.5],
        turnAngle: [0.3, 0.6],
        stepSize: [0.18, 0.3],
        deposit: [0.045, 0.08],
        depositWidth: [1.2, 2],
        diffusion: [0.03, 0.08],
        decay: [0.958, 0.976],
        resistance: [0.02, 0.12],
        randomness: [0.28, 0.55],
        trailCap: [0.6, 1]
      },
      params: { attractionStrength: 0.2, networkDensity: 0.34, permeability: 0.8, flowCoupling: 0.28 }
    },
    "strong-pull": {
      chamber: "point",
      neck: "line",
      agents: [360, 460],
      origin: [-1.4, 1.4],
      scale: [0.96, 1.04],
      clustering: [0.68, 0.88],
      isolation: [1.8, 2.8],
      approach: [1, 1.7],
      exposure: [0.2, 0.36],
      slime: {
        persistence: [0.7, 0.86],
        trailInfluence: [1.7, 2],
        sensorAngle: [0.1, 0.2],
        sensorDistance: [0.35, 0.6],
        turnAngle: [0.08, 0.18],
        stepSize: [0.11, 0.16],
        deposit: [0.09, 0.14],
        depositWidth: [1, 1.4],
        diffusion: [2e-3, 0.012],
        decay: [0.98, 0.992],
        resistance: [0.24, 0.42],
        randomness: [0.03, 0.1],
        trailCap: [1.25, 1.6]
      },
      params: { attractionStrength: 0.96, networkDensity: 0.55, directionalBias: 0.8, flowCoupling: 0.74 }
    },
    "wide-sensors": {
      chamber: "stroke",
      neck: "curve",
      agents: [280, 380],
      origin: [-2.4, 2.4],
      scale: [0.9, 1.05],
      clustering: [0.28, 0.5],
      isolation: [3, 4.6],
      approach: [2.2, 3.5],
      exposure: [0.48, 0.72],
      slime: {
        persistence: [0.45, 0.68],
        trailInfluence: [0.9, 1.4],
        sensorAngle: [0.35, 0.6],
        sensorDistance: [1.5, 2.15],
        turnAngle: [0.25, 0.48],
        stepSize: [0.26, 0.42],
        deposit: [0.06, 0.11],
        depositWidth: [1.4, 2.2],
        diffusion: [0.025, 0.06],
        decay: [0.97, 0.984],
        resistance: [0.06, 0.18],
        randomness: [0.14, 0.3],
        trailCap: [1, 1.4]
      },
      params: { influenceRadius: 8.5, scaleVariation: 0.82, permeability: 0.68, attractionStrength: 0.5 }
    },
    "micro-step": {
      chamber: "point",
      neck: "dots",
      agents: [400, 500],
      origin: [-1.8, 1.8],
      scale: [0.94, 1.04],
      clustering: [0.58, 0.78],
      isolation: [2, 3.2],
      approach: [1.1, 1.8],
      exposure: [0.3, 0.5],
      slime: {
        persistence: [0.6, 0.78],
        trailInfluence: [1.2, 1.65],
        sensorAngle: [0.12, 0.22],
        sensorDistance: [0.25, 0.42],
        turnAngle: [0.1, 0.2],
        stepSize: [0.08, 0.11],
        deposit: [0.11, 0.17],
        depositWidth: [0.85, 1.1],
        diffusion: [4e-3, 0.014],
        decay: [0.976, 0.988],
        resistance: [0.16, 0.3],
        randomness: [0.06, 0.16],
        trailCap: [1.15, 1.5]
      },
      params: { attractionStrength: 0.66, permeability: 0.24, flowCoupling: 0.7, networkDensity: 0.6 }
    },
    "decay-fast": {
      chamber: "point",
      neck: "line",
      agents: [260, 360],
      origin: [-2.2, 2.2],
      scale: [0.9, 1.04],
      clustering: [0.24, 0.44],
      isolation: [3.2, 4.8],
      approach: [1.4, 2.4],
      exposure: [0.42, 0.68],
      slime: {
        persistence: [0.5, 0.7],
        trailInfluence: [1, 1.45],
        sensorAngle: [0.2, 0.38],
        sensorDistance: [0.5, 0.9],
        turnAngle: [0.16, 0.3],
        stepSize: [0.13, 0.2],
        deposit: [0.08, 0.13],
        depositWidth: [0.95, 1.3],
        diffusion: [8e-3, 0.02],
        decay: [0.912, 0.942],
        resistance: [0.1, 0.24],
        randomness: [0.1, 0.22],
        trailCap: [0.7, 1.05]
      },
      params: { decay: 0.09, decayMode: "aggressive", attractionStrength: 0.6, networkDensity: 0.3 }
    },
    "decay-slow": {
      chamber: "point",
      neck: "curve",
      agents: [340, 440],
      origin: [-1.6, 1.6],
      scale: [0.96, 1.05],
      clustering: [0.5, 0.72],
      isolation: [2.2, 3.4],
      approach: [1.6, 2.6],
      exposure: [0.28, 0.48],
      slime: {
        persistence: [0.58, 0.78],
        trailInfluence: [1.15, 1.6],
        sensorAngle: [0.18, 0.32],
        sensorDistance: [0.5, 0.85],
        turnAngle: [0.14, 0.26],
        stepSize: [0.12, 0.18],
        deposit: [0.07, 0.12],
        depositWidth: [1.2, 1.8],
        diffusion: [0.015, 0.04],
        decay: [0.992, 0.996],
        resistance: [0.12, 0.26],
        randomness: [0.08, 0.18],
        trailCap: [1.35, 1.7]
      },
      params: { decay: 0.02, decayMode: "controlled", attractionStrength: 0.62, flowCoupling: 0.68 }
    },
    "asymmetric-mix": {
      chamber: "mixed",
      neck: "mixed",
      agents: [280, 480],
      origin: [-3.2, 3.2],
      scale: [0.84, 1.08],
      clustering: [0.18, 0.8],
      isolation: [1.8, 5.6],
      approach: [0.8, 3.8],
      exposure: [0.18, 0.88],
      slime: {
        persistence: [0.18, 0.86],
        trailInfluence: [0.2, 1.9],
        sensorAngle: [0.1, 1.1],
        sensorDistance: [0.3, 1.9],
        turnAngle: [0.08, 0.9],
        stepSize: [0.09, 0.36],
        deposit: [0.03, 0.2],
        depositWidth: [0.85, 3],
        diffusion: [0, 0.16],
        decay: [0.92, 0.995],
        resistance: [0, 0.55],
        randomness: [0.04, 0.85],
        trailCap: [0.5, 1.75]
      },
      params: { attractionStrength: 0.45, geometryVariation: 0.86, scaleVariation: 0.8, networkDensity: 0.42, randomness: 0.18 }
    }
  };
  var ROOM_VOICES = ["disk", "cloud", "swarm", "shell", "stroke"];
  var NECK_VOICES = ["hair", "vein", "corridor", "steps", "void"];
  var HALO_VOICES = ["bare", "mist", "overgrown"];
  function frame(rng) {
    return {
      r: (min, max) => min + rng() * (max - min),
      int: (min, max) => Math.floor(min + rng() * (max - min + 1)),
      chance: (p) => rng() < p,
      pick: (items) => items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
    };
  }
  function at(x, y, r) {
    return { x: lim(x), y: lim(y), r };
  }
  function span(f, range) {
    return f.r(range[0], range[1]);
  }
  function rotate(x, y, originX, originY, twist) {
    const dx = x - originX;
    const dy = y - originY;
    const c = Math.cos(twist);
    const s = Math.sin(twist);
    return { x: originX + dx * c - dy * s, y: originY + dx * s + dy * c };
  }
  function fitSequence(nodes, plan) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node3 of nodes) {
      minX = Math.min(minX, node3.x);
      minY = Math.min(minY, node3.y);
      maxX = Math.max(maxX, node3.x);
      maxY = Math.max(maxY, node3.y);
    }
    const spanX = Math.max(0.01, maxX - minX);
    const spanY = Math.max(0.01, maxY - minY);
    const dest = (FIELD_SIZE - 3.2) * plan.scale;
    const destMin = (FIELD_SIZE - dest) / 2;
    const stretchX = spanX >= spanY * 0.55;
    const stretchY = spanY >= spanX * 0.55;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    return nodes.map((node3) => {
      const x = stretchX ? destMin + (node3.x - minX) / spanX * dest : CENTER2 + (node3.x - midX);
      const y = stretchY ? destMin + (node3.y - minY) / spanY * dest : CENTER2 + (node3.y - midY);
      return at(x, y, node3.r);
    });
  }
  function layout(nodes, plan) {
    const placed = nodes.map((node3) => {
      const x = plan.originX + (node3.x - CENTER2) * plan.scale;
      const y = plan.originY + (node3.y - CENTER2) * (plan.flip ? -1 : 1) * plan.scale;
      const spun = rotate(x, y, plan.originX, plan.originY, plan.twist);
      return { x: spun.x, y: spun.y, r: node3.r };
    });
    return fitSequence(placed, plan);
  }
  function openR(f, plan) {
    return f.r(plan?.openLo ?? 1.7, plan?.openHi ?? 4.2);
  }
  function pinchR(f) {
    return f.r(0.38, 0.78);
  }
  function beadR(f) {
    return f.r(0.42, 0.72);
  }
  function familyNodes(kind, f, plan) {
    const room = () => openR(f, plan);
    if (kind === "dumbbell-h") {
      const y0 = 10 + f.r(-1.2, 1.2);
      const y1 = 10 + f.r(-2.6, 2.6);
      return { nodes: [at(3.1, y0, room()), at(10, 10, pinchR(f)), at(16.9, y1, room())], links: [[0, 1], [1, 2]], axis: 0 };
    }
    if (kind === "dumbbell-v") {
      const x0 = 10 + f.r(-1.2, 1.2);
      const x1 = 10 + f.r(-2.6, 2.6);
      return { nodes: [at(x0, 3.1, room()), at(10, 10, pinchR(f)), at(x1, 16.9, room())], links: [[0, 1], [1, 2]], axis: Math.PI / 2 };
    }
    if (kind === "dumbbell-d") {
      return { nodes: [at(3.2, 3.4, room()), at(10, 10, pinchR(f)), at(16.8, 16.6, room())], links: [[0, 1], [1, 2]], axis: Math.PI / 4 };
    }
    if (kind === "beads-diag") {
      return {
        nodes: [at(2.6, 2.8, room()), at(6.2, 6.4, pinchR(f)), at(10, 10, room()), at(13.8, 13.6, pinchR(f)), at(17.4, 17.2, room())],
        links: [[0, 1], [1, 2], [2, 3], [3, 4]],
        axis: Math.PI / 4
      };
    }
    if (kind === "beads-vert") {
      return {
        nodes: [at(10, 2.6, room()), at(10, 7.2, pinchR(f)), at(10, 12.8, pinchR(f)), at(10, 17.4, room())],
        links: [[0, 1], [1, 2], [2, 3]],
        axis: Math.PI / 2
      };
    }
    if (kind === "zigzag-h") {
      const amp = f.r(1.6, 5.2);
      return {
        nodes: [at(2.4, 10 - amp, room()), at(6.1, 10, pinchR(f)), at(10, 10 + amp, room()), at(13.9, 10, pinchR(f)), at(17.6, 10 - amp, room())],
        links: [[0, 1], [1, 2], [2, 3], [3, 4]],
        axis: 0
      };
    }
    if (kind === "zigzag-v") {
      const amp = f.r(1.6, 5.2);
      return {
        nodes: [at(10 - amp, 2.4, room()), at(10, 6.1, pinchR(f)), at(10 + amp, 10, room()), at(10, 13.9, pinchR(f)), at(10 - amp, 17.6, room())],
        links: [[0, 1], [1, 2], [2, 3], [3, 4]],
        axis: Math.PI / 2
      };
    }
    if (kind === "serpentine") {
      return {
        nodes: [at(2.4, 3.8, room()), at(6.4, 3.6, pinchR(f)), at(10, 10, room()), at(13.6, 16.4, pinchR(f)), at(17.6, 16.2, room())],
        links: [[0, 1], [1, 2], [2, 3], [3, 4]],
        axis: 0.32
      };
    }
    if (kind === "y-axis") {
      const armsN = f.chance(0.28) ? 4 : 3;
      const reach = f.r(5.4, 7.8);
      const start = f.r(0, Math.PI * 2);
      const hub = at(10, 10, pinchR(f));
      const arms = Array.from({ length: armsN }, (_, i) => {
        const a = start + i / armsN * Math.PI * 2 + f.r(-0.18, 0.18);
        return at(10 + Math.cos(a) * reach, 10 + Math.sin(a) * reach, room());
      });
      const beads = arms.map((arm) => at(10 + (arm.x - 10) * 0.46, 10 + (arm.y - 10) * 0.46, beadR(f)));
      const links = arms.flatMap((_, i) => [[0, 1 + armsN + i], [1 + armsN + i, 1 + i]]);
      return { nodes: [hub, ...arms, ...beads], links, axis: start };
    }
    return {
      nodes: [at(2.6, 2.6, room()), at(2.8, 10, pinchR(f)), at(3, 17.2, room()), at(10, 17.2, pinchR(f)), at(17.2, 17, room())],
      links: [[0, 1], [1, 2], [2, 3], [3, 4]],
      axis: Math.PI / 2
    };
  }
  function chamberMarks(node3, voice, f) {
    const open = node3.r >= 1.6;
    const strength = open ? f.r(1.05, 1.45) : f.r(0.45, 0.8);
    if (!open) {
      return [{ kind: "point", x: lim(node3.x), y: lim(node3.y), radius: node3.r, strength }];
    }
    if (voice === "cloud") {
      return [{ kind: "point", x: lim(node3.x), y: lim(node3.y), radius: node3.r * f.r(1.05, 1.35), strength: f.r(0.55, 0.85) }];
    }
    if (voice === "swarm") {
      const count = f.int(7, 13);
      return Array.from({ length: count }, () => {
        const a = f.r(0, Math.PI * 2);
        const d = node3.r * f.r(0, 0.92);
        return {
          kind: "point",
          x: lim(node3.x + Math.cos(a) * d),
          y: lim(node3.y + Math.sin(a) * d),
          radius: f.r(0.35, 0.7),
          strength: f.r(0.55, 1.05)
        };
      });
    }
    if (voice === "shell") {
      const count = f.int(8, 14);
      return Array.from({ length: count }, (_, i) => {
        const a = i / count * Math.PI * 2 + f.r(-0.08, 0.08);
        return {
          kind: "point",
          x: lim(node3.x + Math.cos(a) * node3.r),
          y: lim(node3.y + Math.sin(a) * node3.r),
          radius: f.r(0.32, 0.62),
          strength: f.r(0.7, 1.15)
        };
      });
    }
    if (voice === "stroke") {
      const a = f.r(0, Math.PI);
      const half = node3.r * f.r(0.7, 1.05);
      return [{
        kind: "line",
        x: lim(node3.x - Math.cos(a) * half),
        y: lim(node3.y - Math.sin(a) * half),
        x2: lim(node3.x + Math.cos(a) * half),
        y2: lim(node3.y + Math.sin(a) * half),
        radius: node3.r * f.r(0.45, 0.75),
        strength
      }];
    }
    return [{ kind: "point", x: lim(node3.x), y: lim(node3.y), radius: node3.r, strength }];
  }
  function neckMarks(a, b, voice, f) {
    if (voice === "void") return [];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const start = { x: lim(a.x + ux * Math.min(a.r * 0.82, len * 0.38)), y: lim(a.y + uy * Math.min(a.r * 0.82, len * 0.38)) };
    const end = { x: lim(b.x - ux * Math.min(b.r * 0.82, len * 0.38)), y: lim(b.y - uy * Math.min(b.r * 0.82, len * 0.38)) };
    if (voice === "steps") {
      const count = f.int(2, 4);
      return Array.from({ length: count }, (_, i) => {
        const t = (i + 1) / (count + 1);
        return {
          kind: "point",
          x: lim(start.x + (end.x - start.x) * t + f.r(-0.22, 0.22)),
          y: lim(start.y + (end.y - start.y) * t + f.r(-0.22, 0.22)),
          radius: f.r(0.28, 0.55),
          strength: f.r(0.28, 0.52)
        };
      });
    }
    const width = voice === "hair" ? f.r(0.12, 0.22) : voice === "corridor" ? f.r(0.32, 0.52) : f.r(0.22, 0.4);
    const mark = {
      kind: voice === "vein" ? "curve" : "line",
      x: start.x,
      y: start.y,
      x2: end.x,
      y2: end.y,
      radius: width,
      strength: voice === "hair" ? f.r(0.22, 0.4) : f.r(0.4, 0.75)
    };
    if (voice === "vein") {
      mark.cx = lim((start.x + end.x) / 2 - uy * f.r(0.4, 1.6));
      mark.cy = lim((start.y + end.y) / 2 + ux * f.r(0.4, 1.6));
    }
    return [mark];
  }
  function thinNodes(built, growth) {
    if (growth !== "sparse-field" || built.nodes.length <= 3) return built;
    const nodes = [built.nodes[0], built.nodes[Math.floor(built.nodes.length / 2)], built.nodes[built.nodes.length - 1]];
    return { nodes, links: [[0, 1], [1, 2]] };
  }
  function planCompressedSequential(seed, attempt = 0, index2 = 0) {
    const rng = mulberry32(seed ^ 12648430 ^ attempt * 668265261 ^ index2 * 2654435769);
    const f = frame(rng);
    const halo = f.pick(HALO_VOICES);
    const openLo = f.r(2.6, 3.4);
    return {
      kind: f.pick(SEQUENCE_FAMILIES),
      growth: f.pick(GROWTH_MODES),
      index: index2,
      scale: f.r(0.72, 1.05),
      fill: f.r(0.55, 1),
      flip: f.chance(0.5),
      originX: CENTER2 + f.r(-1.4, 1.4),
      originY: CENTER2 + f.r(-1.4, 1.4),
      twist: f.r(-0.45, 0.45),
      neckW: f.r(0.1, 0.42),
      attractorsOnly: halo !== "overgrown",
      roomVoice: f.pick(ROOM_VOICES),
      neckVoice: f.pick(NECK_VOICES),
      halo,
      openLo,
      openHi: openLo + f.r(0.5, 1.3)
    };
  }
  function attractorsFromCompressedSequential(plan, seed, attempt = 0) {
    const rng = mulberry32(seed ^ 5369869 ^ attempt * 2246822507 ^ plan.index * 374761393);
    const f = frame(rng);
    const built = thinNodes(familyNodes(plan.kind, f, plan), plan.growth);
    const jittered = built.nodes.map((node3) => ({
      x: node3.x + f.r(-0.2, 0.2),
      y: node3.y + f.r(-0.2, 0.2),
      r: node3.r >= 1.6 ? node3.r * f.r(0.94, 1.08) : node3.r * f.r(0.88, 1.05)
    }));
    const nodes = layout(jittered, plan);
    const marks = [];
    nodes.forEach((node3) => {
      marks.push(...chamberMarks(node3, plan.roomVoice, f));
    });
    built.links.forEach(([i, j]) => {
      if (!nodes[i] || !nodes[j]) return;
      marks.push(...neckMarks(nodes[i], nodes[j], plan.neckVoice, f));
    });
    return marks;
  }
  function slimeFromCompressedSequential(base2, plan, seed) {
    const rng = mulberry32(seed ^ 5357790 ^ plan.index);
    const f = frame(rng);
    const spec2 = GROWTH_SPECS[plan.growth];
    const s = spec2.slime;
    return {
      ...base2,
      persistence: span(f, s.persistence),
      trailInfluence: span(f, s.trailInfluence),
      sensorAngle: span(f, s.sensorAngle),
      sensorDistance: span(f, s.sensorDistance),
      turnAngle: span(f, s.turnAngle),
      stepSize: span(f, s.stepSize),
      deposit: f.r(0.01, 0.28),
      depositWidth: f.r(0.28, 3.4),
      diffusion: f.r(0, 0.12),
      decay: f.r(0.92, 0.996),
      resistance: span(f, s.resistance),
      randomness: span(f, s.randomness),
      trailCap: f.r(0.2, 1.9),
      voidElongation: 1,
      voidRotation: 0,
      voidLobes: 0,
      voidNotch: 0,
      foodPoints: [{ x: plan.originX, y: plan.originY }]
    };
  }
  function paramsFromCompressedSequential(base2, plan) {
    const extra = GROWTH_SPECS[plan.growth].params;
    const randomness = extra.randomness ?? base2.randomness;
    const decay = extra.decay ?? base2.decay;
    return {
      ...base2,
      ...extra,
      randomnessMode: randomness > 0.16 ? "high" : randomness < 0.06 ? "low" : "medium",
      decayMode: decay > 0.07 ? "aggressive" : "controlled"
    };
  }
  function recipeFromCompressedSequential(recipe, plan, seed) {
    const rng = mulberry32(seed ^ 5368862);
    const f = frame(rng);
    const spec2 = GROWTH_SPECS[plan.growth];
    return {
      ...recipe,
      clustering: f.r(0.08, 0.94),
      isolationRadius: span(f, spec2.isolation),
      approachWidth: span(f, spec2.approach),
      coreExposure: span(f, spec2.exposure)
    };
  }
  function agentsFromCompressedSequential(plan, seed) {
    const rng = mulberry32(seed ^ 659918);
    const [lo, hi] = GROWTH_SPECS[plan.growth].agents;
    return Math.round(Math.min(320, Math.max(70, lo + rng() * (hi - lo))));
  }
  function foodFromAttractors(marks) {
    const points = marks.flatMap((mark) => {
      const mid = mark.x2 != null ? [{ x: (mark.x + mark.x2) / 2, y: (mark.y + (mark.y2 ?? mark.y)) / 2 }] : [];
      const end = mark.x2 != null ? [{ x: mark.x2, y: mark.y2 ?? mark.y }] : [];
      return [{ x: mark.x, y: mark.y }, ...end, ...mid];
    });
    return points.filter((point, index2) => points.findIndex((other) => Math.hypot(other.x - point.x, other.y - point.y) < 0.35) === index2);
  }

  // lib/skill1/run-contained-room.ts
  var TWO_PI3 = Math.PI * 2;
  var LO = 0.65;
  var HI = FIELD_SIZE - 0.65;
  function frame2(rng) {
    return { r: (min, max) => min + rng() * (max - min) };
  }
  var CONTAINED_FAMILIES = [
    "centered",
    "offset",
    "edge",
    "elongated",
    "lobed",
    "wrapped",
    "branched",
    "partial",
    "enclosed",
    "satellites"
  ];
  var CONTAINED_GROWTHS = ["mesh", "vein", "braid", "mass"];
  var clamp3 = (value, min, max) => Math.min(max, Math.max(min, value));
  function specFor(index2) {
    const kind = CONTAINED_FAMILIES[index2 % CONTAINED_FAMILIES.length];
    const v = Math.floor(index2 / CONTAINED_FAMILIES.length);
    const rng = mulberry32((12624365 ^ (index2 + 1) * 2654435761) >>> 0);
    const rot = rng() * Math.PI;
    const angle = rot + v * 0.55;
    let cx = 10;
    let cy = 10;
    let coreR = 3.2;
    let elong = 1;
    let lobes = 0.08;
    let notch = 0.06;
    let layers = 2;
    let mouth = 0.35;
    let gapped = 1;
    let wedges = 0;
    if (kind === "centered") {
      cx = 8.6 + v % 5 * 0.55;
      cy = 8.4 + v * 2 % 5 * 0.6;
      coreR = 2.9 + v % 4 * 0.38;
    } else if (kind === "offset") {
      const dist2 = 3.2 + v % 3 * 0.7;
      cx = clamp3(10 + Math.cos(angle) * dist2, 4.2, 15.8);
      cy = clamp3(10 + Math.sin(angle) * dist2, 4.2, 15.8);
      coreR = 2.7 + v % 4 * 0.32;
      mouth = 0.7;
    } else if (kind === "edge") {
      const inset = 3.1 + v % 3 * 0.45;
      const along4 = 6 + v % 5 * 1.8;
      const side = v % 4;
      if (side === 0) {
        cx = inset;
        cy = along4;
      } else if (side === 1) {
        cx = FIELD_SIZE - inset;
        cy = along4;
      } else if (side === 2) {
        cx = along4;
        cy = inset;
      } else {
        cx = along4;
        cy = FIELD_SIZE - inset;
      }
      coreR = 2.5 + v % 3 * 0.28;
      mouth = 0.2;
    } else if (kind === "elongated") {
      cx = 7.5 + v % 4 * 1.3;
      cy = 7.2 + v * 3 % 4 * 1.4;
      coreR = 2.15 + v % 3 * 0.25;
      elong = 2.05 + v % 4 * 0.16;
      mouth = 0.45;
    } else if (kind === "lobed") {
      cx = 8 + v % 4 * 1.1;
      cy = 8.2 + v * 2 % 4 * 1.05;
      coreR = 3.15 + v % 3 * 0.35;
      elong = 0.95 + v % 3 * 0.12;
      lobes = 0.55 + v % 4 * 0.07;
      notch = 0.12;
      mouth = 0.4;
    } else if (kind === "wrapped") {
      cx = 7.4 + v % 5 * 1.05;
      cy = 7.6 + v * 2 % 5 * 0.95;
      coreR = 2.7 + v % 4 * 0.28;
      layers = 3;
      mouth = 0.22;
      gapped = 0;
    } else if (kind === "branched") {
      const dist2 = 2.4 + v % 3 * 0.8;
      cx = clamp3(10 + Math.cos(angle) * dist2, 5, 15);
      cy = clamp3(10 + Math.sin(angle) * dist2, 5, 15);
      coreR = 2.55 + v % 3 * 0.3;
      mouth = 1.15;
      wedges = 3;
      layers = 2;
    } else if (kind === "partial") {
      cx = 8.2 + v % 4 * 1.15;
      cy = 8 + v * 3 % 4 * 1.2;
      coreR = 3.05 + v % 3 * 0.35;
      mouth = 1.7 + v % 3 * 0.28;
      gapped = 2;
      layers = 2;
    } else if (kind === "enclosed") {
      cx = 8.8 + v % 4 * 0.7;
      cy = 8.6 + v * 2 % 4 * 0.75;
      coreR = 3.3 + v % 3 * 0.4;
      layers = 3;
      mouth = 0.12;
      gapped = 0;
      lobes = 0.22;
    } else {
      cx = 8.4 + v % 4 * 0.9;
      cy = 9 + v * 2 % 4 * 0.7;
      coreR = 2.7 + v % 3 * 0.25;
      mouth = 0.55;
      layers = 2;
    }
    const holes = [{ x: cx, y: cy, r: coreR }];
    if (kind === "satellites") {
      for (let i = 0; i < 2; i += 1) {
        const ang = angle + i * 2.2 + 0.6;
        const dist2 = coreR + 4.2 + i * 0.8;
        holes.push({
          x: clamp3(cx + Math.cos(ang) * dist2, 2.2, 17.8),
          y: clamp3(cy + Math.sin(ang) * dist2, 2.2, 17.8),
          r: 1.25 + (i === 0 ? 0.25 : 0)
        });
      }
    }
    return {
      kind,
      v,
      cx,
      cy,
      rot,
      coreR,
      elong,
      lobes,
      notch,
      layers,
      mouth,
      mouthAt: angle + Math.PI,
      gapped,
      wedges,
      fieldTarget: 66 + v % 3 * 4,
      holes
    };
  }
  function shapeOf(spec2) {
    return {
      voidElongation: spec2.elong,
      voidRotation: spec2.rot,
      voidLobes: spec2.lobes,
      voidNotch: spec2.notch
    };
  }
  function insideHole(spec2, x, y, pad) {
    const shape = shapeOf(spec2);
    for (const hole2 of spec2.holes) {
      const angle = Math.atan2(y - hole2.y, x - hole2.x);
      if (Math.hypot(x - hole2.x, y - hole2.y) < voidRadius(angle, hole2.r, shape) + pad) return true;
    }
    return false;
  }
  function angDiff(a, b) {
    return Math.atan2(Math.sin(a - b), Math.cos(a - b));
  }
  function collar(spec2, rng, hole2, layers, gapped) {
    const shape = shapeOf(spec2);
    const points = [];
    for (let layer = 0; layer < layers; layer += 1) {
      const pad = 0.42 + layer * 0.92;
      const count = Math.max(12, Math.round((hole2.r + pad) * 2.55));
      for (let i = 0; i < count; i += 1) {
        const a = spec2.rot + i / count * TWO_PI3 + (rng() - 0.5) * 0.55;
        if (layer < gapped && Math.abs(angDiff(a, spec2.mouthAt)) < spec2.mouth * 0.5) continue;
        const dist2 = voidRadius(a, hole2.r, shape) + pad + (rng() - 0.5) * (0.85 + layer * 0.35);
        const x = hole2.x + Math.cos(a) * dist2;
        const y = hole2.y + Math.sin(a) * dist2;
        if (x < LO || y < LO || x > HI || y > HI) continue;
        points.push({ x, y });
      }
    }
    return points;
  }
  function inWedge(spec2, x, y) {
    if (!spec2.wedges) return true;
    const angle = Math.atan2(y - spec2.cy, x - spec2.cx);
    for (let i = 0; i < spec2.wedges; i += 1) {
      const at2 = spec2.mouthAt + i * (TWO_PI3 / spec2.wedges);
      if (Math.abs(angDiff(angle, at2)) < 0.42) return true;
    }
    return false;
  }
  function fieldPoints(spec2, rng, existing) {
    const points = existing.slice();
    const step = 2.05;
    for (let y = 1.5; y <= 18.5; y += step) {
      for (let x = 1.5; x <= 18.5; x += step) {
        const px = x + (rng() - 0.5) * 0.7;
        const py = y + (rng() - 0.5) * 0.7;
        if (px < LO || py < LO || px > HI || py > HI) continue;
        if (insideHole(spec2, px, py, 0.28)) continue;
        if (points.some((point) => Math.hypot(point.x - px, point.y - py) < 0.85)) continue;
        points.push({ x: px, y: py });
      }
    }
    let guard = 0;
    const extra = spec2.wedges ? 18 : 14;
    let added = 0;
    while (added < extra && guard < 400) {
      guard += 1;
      const x = LO + rng() * (HI - LO);
      const y = LO + rng() * (HI - LO);
      if (insideHole(spec2, x, y, 0.3)) continue;
      const near = Math.hypot(x - spec2.cx, y - spec2.cy) < spec2.coreR + 2.6;
      if (spec2.wedges) {
        if (!inWedge(spec2, x, y) && !near) continue;
      } else if (!near && rng() > 0.35) continue;
      if (points.some((point) => Math.hypot(point.x - x, point.y - y) < 0.9)) continue;
      points.push({ x, y });
      added += 1;
    }
    return points;
  }
  function build(index2) {
    const spec2 = specFor(index2);
    const rng = mulberry32((20973 ^ (index2 + 3) * 2246822507) >>> 0);
    const shell = collar(spec2, rng, spec2.holes[0], spec2.layers, spec2.gapped);
    for (const hole2 of spec2.holes.slice(1)) shell.push(...collar(spec2, rng, hole2, 1, 0));
    const points = fieldPoints(spec2, rng, shell);
    return { spec: spec2, points };
  }
  function planContainedRoom(seed, attempt = 0, index2 = 0) {
    const spec2 = specFor(index2);
    const rng = mulberry32(seed ^ 12624365 ^ attempt * 668265261 ^ index2 * 2654435769);
    const f = frame2(rng);
    return {
      kind: spec2.kind,
      growth: CONTAINED_GROWTHS[(spec2.v + attempt) % CONTAINED_GROWTHS.length],
      index: index2,
      cycle: spec2.v,
      turn: spec2.rot,
      driftX: f.r(-0.04, 0.04),
      driftY: f.r(-0.04, 0.04),
      roomU: spec2.cx,
      roomV: spec2.cy,
      openings: spec2.mouth > 1.2 ? 2 : spec2.mouth > 0.4 ? 1 : 0
    };
  }
  function attractorsFromContainedRoom(plan) {
    const { spec: spec2, points } = build(plan.index);
    const rings = spec2.holes.map((hole2) => ({
      kind: "ring",
      x: hole2.x,
      y: hole2.y,
      radius: hole2.r * 0.42,
      strength: 0.04,
      hole: true
    }));
    const marks = points.map((point) => ({
      kind: "point",
      x: point.x,
      y: point.y,
      radius: 2.15,
      strength: Math.hypot(point.x - spec2.cx, point.y - spec2.cy) < spec2.coreR + 2.2 ? 0.55 : 0.34
    }));
    return [...rings, ...marks];
  }

  // lib/skill1/run-continuous-hall.ts
  var EDGE2 = 1.35;
  var lim2 = (value) => Math.min(FIELD_SIZE - EDGE2, Math.max(EDGE2, value));
  var HALL_FAMILIES = [
    "stroke-h",
    "stroke-diag",
    "beads-h",
    "beads-v",
    "beads-diag",
    "beads-anti",
    "beads-tight",
    "beads-loose",
    "rings-h",
    "rings-diag",
    "taper-beads",
    "offset-beads",
    "twin-beads",
    "short-beads",
    "void-h",
    "void-v",
    "void-diag",
    "void-slash",
    "banks-h",
    "banks-diag"
  ];
  var HALL_GROWTHS = [
    "hairline",
    "ribbon",
    "bloom",
    "heavy",
    "faint",
    "wet",
    "dry",
    "tight",
    "loose",
    "slow",
    "fast",
    "biased",
    "soft",
    "hard",
    "sparse",
    "packed",
    "short",
    "long",
    "banked",
    "open"
  ];
  var SPECS = {
    hairline: spec("white", [0.3, 0.5], [7.4, 12], [55, 110], [0.84, 0.94], [0.05, 0.12], [0.8, 0.92]),
    ribbon: spec("vein", [0.7, 1.15], [8, 12.8], [48, 80], [0.55, 0.75], [0.12, 0.24], [0.55, 0.74]),
    bloom: spec("green", [1.15, 1.9], [7.2, 12], [48, 72], [0.32, 0.55], [0.22, 0.42], [0.38, 0.58]),
    heavy: spec("green", [1.3, 2.1], [7, 11.8], [56, 80], [0.3, 0.5], [0.18, 0.34], [0.42, 0.62]),
    faint: spec("white", [0.35, 0.65], [6.8, 11.2], [60, 120], [0.8, 0.93], [0.04, 0.11], [0.76, 0.9]),
    wet: spec("green", [0.95, 1.7], [7.4, 12.2], [48, 72], [0.34, 0.56], [0.2, 0.4], [0.4, 0.6]),
    dry: spec("white", [0.38, 0.7], [8.2, 13.2], [65, 125], [0.82, 0.94], [0.04, 0.12], [0.8, 0.92]),
    tight: spec("white", [0.42, 0.78], [8, 12.6], [55, 115], [0.86, 0.95], [0.04, 0.1], [0.84, 0.94]),
    loose: spec("vein", [0.8, 1.5], [7.6, 12.4], [44, 72], [0.48, 0.7], [0.16, 0.3], [0.45, 0.66]),
    slow: spec("vein", [0.55, 1.05], [7.4, 12], [48, 76], [0.5, 0.72], [0.12, 0.24], [0.55, 0.74]),
    fast: spec("vein", [0.45, 0.9], [8.2, 13], [44, 72], [0.58, 0.76], [0.1, 0.22], [0.6, 0.78]),
    biased: spec("vein", [0.4, 0.75], [8.6, 13.6], [40, 68], [0.7, 0.86], [0.08, 0.18], [0.72, 0.88]),
    soft: spec("green", [0.9, 1.6], [7.2, 11.8], [44, 68], [0.34, 0.56], [0.2, 0.38], [0.4, 0.62]),
    hard: spec("white", [0.36, 0.62], [8.4, 13], [50, 105], [0.84, 0.94], [0.03, 0.09], [0.84, 0.94]),
    sparse: spec("white", [0.5, 1.1], [6.8, 11.4], [50, 100], [0.72, 0.9], [0.08, 0.18], [0.68, 0.84]),
    packed: spec("green", [0.7, 1.3], [8, 12.4], [60, 84], [0.36, 0.58], [0.16, 0.3], [0.42, 0.64]),
    short: spec("white", [0.55, 1.2], [5.2, 8], [60, 120], [0.7, 0.88], [0.08, 0.18], [0.64, 0.82]),
    long: spec("vein", [0.45, 0.95], [11, 15.2], [48, 80], [0.52, 0.74], [0.1, 0.22], [0.6, 0.78]),
    banked: spec("green", [0.85, 1.45], [8.2, 13.4], [48, 72], [0.28, 0.5], [0.2, 0.4], [0.34, 0.56]),
    open: spec("green", [1.05, 1.85], [7.6, 12.6], [44, 70], [0.3, 0.52], [0.22, 0.42], [0.32, 0.54])
  };
  var WHITE_GROWTHS = HALL_GROWTHS.filter((item) => SPECS[item].density === "white");
  var VEIN_GROWTHS = HALL_GROWTHS.filter((item) => SPECS[item].density === "vein");
  var GREEN_GROWTHS = HALL_GROWTHS.filter((item) => SPECS[item].density === "green");
  function spec(density, width, length, agents, persistence, sensorAngle, bias) {
    const slime = density === "white" ? {
      persistence: [0.62, 0.82],
      trailInfluence: [0.7, 1.1],
      sensorAngle: [0.14, 0.34],
      sensorDistance: [0.35, 0.75],
      turnAngle: [0.14, 0.32],
      stepSize: [0.1, 0.16],
      deposit: [0.08, 0.12],
      depositWidth: [2.4, 2.9],
      diffusion: [0, 1e-3],
      decay: [0.993, 0.997],
      resistance: [0.18, 0.4],
      randomness: [0.08, 0.16],
      trailCap: [0.28, 0.42]
    } : density === "vein" ? {
      persistence: [0.55, 0.78],
      trailInfluence: [0.75, 1.15],
      sensorAngle: [0.1, 0.22],
      sensorDistance: [0.32, 0.7],
      turnAngle: [0.08, 0.2],
      stepSize: [0.1, 0.16],
      deposit: [0.08, 0.12],
      depositWidth: [2.5, 2.95],
      diffusion: [6e-3, 0.018],
      decay: [0.993, 0.997],
      resistance: [0.12, 0.28],
      randomness: [0.08, 0.2],
      trailCap: [0.3, 0.46]
    } : {
      persistence: [0.3, 0.52],
      trailInfluence: [0.8, 1.2],
      sensorAngle: [0.18, 0.42],
      sensorDistance: [0.5, 1.1],
      turnAngle: [0.16, 0.34],
      stepSize: [0.12, 0.2],
      deposit: [0.09, 0.13],
      depositWidth: [2.6, 3],
      diffusion: [0, 4e-3],
      decay: [0.994, 0.997],
      resistance: [0.04, 0.14],
      randomness: [0.08, 0.18],
      trailCap: [0.32, 0.48]
    };
    return {
      density,
      width,
      length,
      agents,
      clustering: [0.4, 0.9],
      isolation: [1.2, 4.2],
      approach: [0.8, 2.4],
      exposure: [0.45, 0.92],
      slime,
      params: {
        attractionStrength: density === "white" ? 0.28 : density === "vein" ? 0.52 : 0.92,
        directionalBias: (bias[0] + bias[1]) / 2,
        networkDensity: density === "white" ? 0.1 : density === "vein" ? 0.36 : 0.78,
        permeability: density === "white" ? 0.32 : density === "vein" ? 0.48 : 0.72,
        geometryVariation: density === "green" ? 0.22 : 0.4,
        nodeRepetition: density === "green" ? 0.5 : 0.74
      }
    };
  }
  function frame3(rng) {
    return {
      r: (min, max) => min + rng() * (max - min),
      int: (min, max) => Math.floor(min + rng() * (max - min + 1)),
      chance: (p) => rng() < p,
      pick: (items) => items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
    };
  }
  function span2(f, pair) {
    return f.r(pair[0], pair[1]);
  }
  function continuousHallBands(family, growth, figure) {
    const spec2 = SPECS[growth];
    const short = growth === "short" || family === "short-beads";
    const length = short ? [5, 7.6] : growth === "long" ? [11.2, 15.2] : spec2.length;
    const width = figure === "beads" ? [spec2.width[0] * 1.15, spec2.width[1] * 1.35] : spec2.width;
    return { length, width };
  }
  function figureOf(family) {
    if (family === "stroke-h" || family === "stroke-diag") return "stroke";
    if (family === "void-h" || family === "void-v" || family === "void-diag" || family === "void-slash" || family === "banks-h" || family === "banks-diag") {
      return "void-cut";
    }
    return "beads";
  }
  function axisOf(family) {
    switch (family) {
      case "stroke-h":
        return { dx: 1, dy: 0.08, cx: 10, cy: 9.4 };
      case "stroke-diag":
        return { dx: 0.82, dy: 0.58, cx: 10.2, cy: 10.4 };
      case "beads-h":
        return { dx: 1, dy: 0, cx: 10, cy: 7.6 };
      case "beads-v":
        return { dx: 0.08, dy: 1, cx: 13.2, cy: 10 };
      case "beads-diag":
        return { dx: 0.86, dy: 0.52, cx: 9.4, cy: 8.8 };
      case "beads-anti":
        return { dx: 0.84, dy: -0.54, cx: 10.6, cy: 12.2 };
      case "beads-tight":
        return { dx: 0.92, dy: 0.28, cx: 10, cy: 11.4 };
      case "beads-loose":
        return { dx: 0.7, dy: 0.72, cx: 8.8, cy: 9.2 };
      case "rings-h":
        return { dx: 1, dy: -0.06, cx: 10, cy: 14.2 };
      case "rings-diag":
        return { dx: 0.78, dy: 0.62, cx: 11.2, cy: 7.2 };
      case "taper-beads":
        return { dx: 0.88, dy: 0.4, cx: 9.6, cy: 12.6 };
      case "offset-beads":
        return { dx: 0.95, dy: -0.32, cx: 11.8, cy: 5.6 };
      case "twin-beads":
        return { dx: 1, dy: 0.1, cx: 10, cy: 10.8 };
      case "short-beads":
        return { dx: 0.74, dy: 0.66, cx: 7.4, cy: 13.4 };
      case "void-h":
        return { dx: 1, dy: 0, cx: 10, cy: 10 };
      case "void-v":
        return { dx: 0, dy: 1, cx: 10, cy: 10 };
      case "void-diag":
        return { dx: 0.8, dy: 0.6, cx: 10, cy: 10 };
      case "void-slash":
        return { dx: 0.8, dy: -0.6, cx: 10, cy: 10 };
      case "banks-h":
        return { dx: 1, dy: 0.05, cx: 10, cy: 8.4 };
      case "banks-diag":
        return { dx: 0.76, dy: 0.64, cx: 9.8, cy: 11.2 };
    }
  }
  function along(cx, cy, dx, dy, length, t) {
    const n = Math.hypot(dx, dy) || 1;
    return {
      x: lim2(cx + dx / n * (t - 0.5) * length),
      y: lim2(cy + dy / n * (t - 0.5) * length)
    };
  }
  function perp(dx, dy) {
    const n = Math.hypot(dx, dy) || 1;
    return { x: -dy / n, y: dx / n };
  }
  function flare(t, pinch) {
    const mid = 1 - Math.abs(t - 0.5) * 2;
    return 1 - (1 - pinch) * mid;
  }
  function gestureOf(plan) {
    const soft = { amp: 0.55, freq: 1.35, bow: 0, gap: 1, shift: 0, reach: 1, diverge: 0 };
    switch (plan.family) {
      case "stroke-h":
        return { ...soft, amp: 0.32, freq: 1.05, gap: 0.82 };
      case "stroke-diag":
        return { ...soft, amp: 0.55, freq: 1.5, gap: 0.95 };
      case "beads-h":
        return { ...soft, amp: 0.75, freq: 2.45 };
      case "beads-v":
        return { ...soft, amp: 0.9, freq: 1.65, gap: 1.08 };
      case "beads-diag":
        return { ...soft, amp: 1.05, freq: 2.15, gap: 1.12 };
      case "beads-anti":
        return { ...soft, amp: 1.05, freq: 2.15, gap: 1.12 };
      case "beads-tight":
        return { ...soft, amp: 0.4, freq: 2.7, gap: 0.62 };
      case "beads-loose":
        return { ...soft, amp: 1.35, freq: 1.25, gap: 1.4 };
      case "rings-h":
        return { ...soft, amp: 0.2, bow: 1.7, freq: 1, gap: 1.05 };
      case "rings-diag":
        return { ...soft, amp: 0.28, bow: 2.15, freq: 1, gap: 1.18 };
      case "taper-beads":
        return { ...soft, amp: 0.65, freq: 1.8, diverge: 1.15, gap: 0.78 };
      case "offset-beads":
        return { ...soft, amp: 0.8, freq: 1.9, shift: 0.24 };
      case "twin-beads":
        return { ...soft, amp: 0.38, freq: 1.45, gap: 0.58 };
      case "short-beads":
        return { ...soft, amp: 0.95, freq: 1.7, reach: 0.55, gap: 0.9 };
      case "void-h":
        return { ...soft, amp: 0.6, freq: 1.2, gap: 1.05 };
      case "void-v":
        return { ...soft, amp: 0.8, freq: 1.7 };
      case "void-diag":
        return { ...soft, amp: 1.05, freq: 1.15, gap: 1.22 };
      case "void-slash":
        return { ...soft, amp: 1.2, freq: 2.05, gap: 0.92 };
      case "banks-h":
        return { ...soft, amp: 0.36, freq: 0.9, gap: 0.7 };
      case "banks-diag":
        return { ...soft, amp: 1.25, freq: 1.55, gap: 1.35 };
    }
  }
  function flaredCorridor(cx, cy, dx, dy, length, radius, pinch, strength, gesture, drift, phase) {
    const marks = [];
    const steps = 6;
    const side = perp(dx, dy);
    const bend = (t) => Math.sin(t * Math.PI * gesture.freq + phase) * gesture.amp + Math.sin(t * Math.PI) * gesture.bow;
    const open = (t) => (t - 0.5) * drift;
    for (let i = 0; i < steps; i += 1) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const a0 = along(cx, cy, dx, dy, length, t0);
      const b0 = along(cx, cy, dx, dy, length, t1);
      const wa = bend(t0) + open(t0);
      const wb = bend(t1) + open(t1);
      const a = { x: lim2(a0.x + side.x * wa), y: lim2(a0.y + side.y * wa) };
      const b = { x: lim2(b0.x + side.x * wb), y: lim2(b0.y + side.y * wb) };
      marks.push({
        kind: "line",
        x: a.x,
        y: a.y,
        x2: b.x,
        y2: b.y,
        radius: radius * flare((t0 + t1) / 2, pinch),
        strength,
        cover: i === 0 || i === steps - 1 ? 1 : 0
      });
    }
    return marks;
  }
  function planContinuousHall(seed, attempt = 0, index2 = 0) {
    const rng = mulberry32(seed ^ 12587290 ^ attempt * 668265261 ^ index2 * 2654435769);
    const f = frame3(rng);
    const family = f.pick(HALL_FAMILIES);
    const growth = f.pick(HALL_GROWTHS);
    const spec2 = SPECS[growth];
    const figure = figureOf(family);
    const short = growth === "short" || family === "short-beads";
    return {
      family,
      growth,
      figure,
      index: index2,
      cx: lim2(f.r(3.6, 16.4)),
      cy: lim2(f.r(3.6, 16.4)),
      length: span2(f, short ? [5, 7.6] : growth === "long" ? [11.2, 15.2] : spec2.length),
      width: span2(f, figure === "beads" ? [spec2.width[0] * 1.15, spec2.width[1] * 1.35] : spec2.width),
      pinch: f.r(0.22, 0.48),
      flip: f.chance(0.5),
      twist: f.r(-0.85, 0.85)
    };
  }
  function hallBanks(plan, dx, dy) {
    const gesture = gestureOf(plan);
    const side = perp(dx, dy);
    const half = Math.min(1.62, Math.max(1.12, 1.05 + (gesture.gap - 0.55) * 0.55));
    const radius = 0.3;
    const n = Math.hypot(dx, dy) || 1;
    const sx = dx / n * plan.length * gesture.shift;
    const sy = dy / n * plan.length * gesture.shift;
    const phase = plan.twist + plan.cx * 0.17;
    const drift = gesture.diverge;
    return [
      ...flaredCorridor(plan.cx + side.x * half, plan.cy + side.y * half, dx, dy, plan.length, radius, plan.pinch, 1, gesture, drift, phase),
      ...flaredCorridor(
        plan.cx - side.x * half + sx,
        plan.cy - side.y * half + sy,
        dx,
        dy,
        plan.length * gesture.reach,
        radius,
        plan.pinch,
        1,
        gesture,
        -drift,
        phase + 0.6
      )
    ];
  }
  function attractorsFromContinuousHall(plan, _seed = 0, _attempt = 0) {
    const axis = axisOf(plan.family);
    const cos = Math.cos(plan.twist);
    const sin = Math.sin(plan.twist);
    const flippedDx = plan.flip ? -axis.dx : axis.dx;
    const flippedDy = plan.flip ? -axis.dy : axis.dy;
    const dx = flippedDx * cos - flippedDy * sin;
    const dy = flippedDx * sin + flippedDy * cos;
    return hallBanks(plan, dx, dy);
  }
  function slimeFromContinuousHall(base2, plan, seed) {
    const rng = mulberry32(seed ^ 1163486 ^ plan.index);
    const f = frame3(rng);
    return {
      ...base2,
      sensorAngle: f.r(0.42, 0.66),
      sensorDistance: f.r(0.4, 0.72),
      turnAngle: f.r(0.18, 0.36),
      stepSize: f.r(0.12, 0.16),
      deposit: 0.016,
      depositWidth: 0.14,
      diffusion: 0,
      decay: 0.998,
      trailInfluence: f.r(0.12, 0.22),
      resistance: 0,
      randomness: f.r(0.2, 0.32),
      persistence: f.r(0.3, 0.42),
      trailCap: 0.36,
      crowdingLimit: 80,
      voidElongation: 1,
      voidRotation: 0,
      voidLobes: 0,
      voidNotch: 0,
      foodPoints: []
    };
  }
  function paramsFromContinuousHall(base2, plan) {
    const extra = SPECS[plan.growth].params;
    const tone = SPECS[plan.growth].density;
    return {
      ...base2,
      ...extra,
      directionalBias: 0.02,
      attractionStrength: 0.05,
      networkDensity: Math.min(base2.networkDensity, 0.12),
      randomnessMode: tone === "white" ? "high" : tone === "vein" ? "medium" : "low",
      decayMode: tone === "white" ? "aggressive" : "controlled"
    };
  }
  function recipeFromContinuousHall(recipe, plan, seed) {
    const rng = mulberry32(seed ^ 1174558);
    const f = frame3(rng);
    const spec2 = SPECS[plan.growth];
    return {
      ...recipe,
      clustering: plan.figure === "void-cut" ? span2(f, [0.12, 0.34]) : f.r(0.12, 0.92),
      isolationRadius: plan.figure === "void-cut" ? span2(f, [2.4, 4.6]) : span2(f, spec2.isolation),
      approachWidth: span2(f, spec2.approach),
      coreExposure: plan.figure === "void-cut" ? span2(f, [0.7, 0.95]) : span2(f, spec2.exposure),
      enclosureCollar: plan.figure === "void-cut" ? span2(f, [0.9, 1.6]) : recipe.enclosureCollar,
      attractorFixed: true,
      attractorsOnly: true,
      attractor: { x: plan.cx, y: plan.cy }
    };
  }
  function agentsFromContinuousHall(plan, seed) {
    const rng = mulberry32(seed ^ 659918);
    const [lo, hi] = SPECS[plan.growth].agents;
    const count = Math.round(lo + rng() * (hi - lo));
    return Math.max(240, Math.min(320, count + 160));
  }
  function trailBounds(snapshot) {
    const trails = snapshot.trails;
    const n = trails.length;
    const size = snapshot.trailSize || Math.sqrt(n);
    let maxTrail = 0;
    for (let i = 0; i < n; i += 1) if (trails[i] > maxTrail) maxTrail = trails[i];
    const cut = maxTrail * 0.2;
    let minX = size;
    let minY = size;
    let maxX = 0;
    let maxY = 0;
    for (let i = 0; i < n; i += 1) {
      if (trails[i] < cut) continue;
      const x = i % size;
      const y = Math.floor(i / size);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    return {
      width,
      height,
      aspect: Math.max(width, height) / Math.max(1, Math.min(width, height)),
      coverage: width * height / Math.max(1, size * size)
    };
  }
  function attractorSpan(attractors) {
    let minX = FIELD_SIZE;
    let minY = FIELD_SIZE;
    let maxX = 0;
    let maxY = 0;
    for (const item of attractors) {
      minX = Math.min(minX, item.x, item.x2 ?? item.x);
      minY = Math.min(minY, item.y, item.y2 ?? item.y);
      maxX = Math.max(maxX, item.x, item.x2 ?? item.x);
      maxY = Math.max(maxY, item.y, item.y2 ?? item.y);
    }
    const width = Math.max(0.4, maxX - minX);
    const height = Math.max(0.4, maxY - minY);
    return Math.max(width, height) / Math.min(width, height);
  }
  function continuousHallIdentity(features, attractors, snapshot) {
    if (!attractors.length) return false;
    const holes = attractors.filter((item) => item.hole || item.kind === "ring");
    const disks = attractors.filter((item) => item.kind === "point" || item.kind === "ring");
    const linear = attractorSpan(attractors) >= 1.7;
    if (!linear) return false;
    if (features.occupied < 3e-3 || features.occupied > 0.8) return false;
    if (holes.length) return true;
    if (disks.length >= 3) return features.components <= 8;
    if (!snapshot) return true;
    const box2 = trailBounds(snapshot);
    return box2.aspect >= 1.7 && box2.coverage < 0.72;
  }
  function hallSignature(attractors, extra) {
    let minX = FIELD_SIZE;
    let minY = FIELD_SIZE;
    let maxX = 0;
    let maxY = 0;
    let sx = 0;
    let sy = 0;
    let holes = 0;
    let points = 0;
    let lines = 0;
    for (const item of attractors) {
      minX = Math.min(minX, item.x, item.x2 ?? item.x);
      minY = Math.min(minY, item.y, item.y2 ?? item.y);
      maxX = Math.max(maxX, item.x, item.x2 ?? item.x);
      maxY = Math.max(maxY, item.y, item.y2 ?? item.y);
      sx += item.x;
      sy += item.y;
      if (item.hole || item.kind === "ring") holes += 1;
      if (item.kind === "point") points += 1;
      if (item.kind === "line" || item.kind === "curve") lines += 1;
    }
    const n = Math.max(1, attractors.length);
    const slime = extra?.slime;
    return [
      (maxX - minX) / FIELD_SIZE,
      (maxY - minY) / FIELD_SIZE,
      sx / n / FIELD_SIZE,
      sy / n / FIELD_SIZE,
      holes / 12,
      points / 16,
      lines / 6,
      extra?.family ? HALL_FAMILIES.indexOf(extra.family) / 20 : 0,
      extra?.growth ? HALL_GROWTHS.indexOf(extra.growth) / 20 : 0,
      extra?.agents ? extra.agents / 560 : 0,
      SPECS[extra?.growth ?? "hairline"].density === "white" ? 0 : SPECS[extra?.growth ?? "hairline"].density === "vein" ? 0.5 : 1,
      slime ? slime.deposit : 0,
      slime ? slime.depositWidth / 2.4 : 0,
      slime ? slime.persistence : 0,
      slime ? slime.sensorAngle / 0.7 : 0,
      slime ? slime.diffusion * 10 : 0
    ];
  }
  function isNovelHall(signature, previous2) {
    if (!previous2.length) return true;
    return previous2.every((item) => {
      let sum = 0;
      const len = Math.min(signature.length, item.length);
      for (let i = 0; i < len; i += 1) {
        const d = signature[i] - item[i];
        sum += d * d;
      }
      return Math.sqrt(sum / Math.max(1, len)) >= 0.22;
    });
  }

  // lib/skill1/run-inserted-horizontal-plate.ts
  var EDGE3 = 1.4;
  var lim3 = (value) => Math.min(FIELD_SIZE - EDGE3, Math.max(EDGE3, value));
  var PLATE_ORGS = ["dominant", "distributed", "stagger", "cascade", "retreat", "cluster", "fragment", "overlap"];
  var PLATE_VARIANTS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
  var LENGTHS = [12.2, 4.4, 8.1, 3.6, 6.4, 9.6, 5.1];
  function seg(lines, a, b) {
    const ax = lim3(a.x);
    const ay = lim3(a.y);
    const bx = lim3(b.x);
    const by = lim3(b.y);
    if (Math.hypot(bx - ax, by - ay) < 0.38) return;
    lines.push({ x: ax, y: ay, x2: bx, y2: by });
  }
  function stroke(lines, points) {
    for (let i = 1; i < points.length; i += 1) {
      if (Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y) > 3.4) continue;
      seg(lines, points[i - 1], points[i]);
    }
  }
  function chaikin(points) {
    if (points.length < 3) return points;
    const out = [points[0]];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    out.push(points[points.length - 1]);
    return out;
  }
  function resample(points, spacing) {
    if (points.length < 2) return points;
    const out = [points[0]];
    let carry = 0;
    for (let i = 1; i < points.length; i += 1) {
      let ax = points[i - 1].x;
      let ay = points[i - 1].y;
      const bx = points[i].x;
      const by = points[i].y;
      let left = Math.hypot(bx - ax, by - ay);
      while (left > 1e-3 && carry + left >= spacing) {
        const need = spacing - carry;
        const t = need / left;
        ax += (bx - ax) * t;
        ay += (by - ay) * t;
        out.push({ x: ax, y: ay });
        left -= need;
        carry = 0;
      }
      carry += left;
    }
    const last = points[points.length - 1];
    const end = out[out.length - 1];
    if (Math.hypot(last.x - end.x, last.y - end.y) > spacing * 0.45) out.push(last);
    return out;
  }
  function soften(points) {
    return resample(chaikin(chaikin(points)), 0.8);
  }
  function bandAt(x0, length, y, thick, tilt, wave) {
    const span4 = Math.max(2.8, length);
    return { x0: lim3(x0), x1: lim3(x0 + span4), y: lim3(y), thick, tilt, wave };
  }
  function place(band, lx, ly) {
    const c = Math.cos(band.tilt);
    const s = Math.sin(band.tilt);
    const cx = (band.x0 + band.x1) / 2;
    return { x: cx + lx * c - ly * s, y: band.y + lx * s + ly * c };
  }
  function drawBand(lines, band, rng) {
    const len = Math.max(2.6, band.x1 - band.x0);
    const trails = 8;
    const amp = Math.max(0.32, band.thick * 0.32);
    for (let row = 0; row < trails; row += 1) {
      const phase = band.wave * 0.8 + row * 1.17;
      const turns = 1.3 + row % 3 * 0.55;
      const reach = amp * (0.55 + row % 4 * 0.14);
      const trim = len * (0.02 + rng() * 0.04);
      const steps = Math.max(28, Math.round(len * 3.6));
      const points = [];
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const lx = -len / 2 + trim + (len - trim * 2) * t;
        const wave = Math.sin(phase + t * Math.PI * 2 * turns) * reach;
        const drift = Math.sin(phase * 0.6 + t * Math.PI * (turns + 1)) * reach * 0.38;
        points.push(place(band, lx, wave + drift));
      }
      stroke(lines, soften(points));
      const at2 = points[Math.min(points.length - 1, 5 + row % 4 * 2)];
      const back = points[Math.min(points.length - 1, 12 + row % 3 * 2)];
      if (!at2 || !back) continue;
      const lift = (row % 2 === 0 ? 1 : -1) * (1.25 + rng() * 0.7);
      const away = { x: (at2.x + back.x) / 2 + lift * 0.35, y: (at2.y + back.y) / 2 + lift };
      vein(lines, at2, away, lift);
      vein(lines, away, back, -lift * 0.7);
    }
  }
  function vein(lines, a, b, bend) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const mid = { x: (a.x + b.x) / 2 + -dy / len * bend, y: (a.y + b.y) / 2 + dx / len * bend };
    const points = [];
    for (let i = 0; i <= 4; i += 1) {
      const t = i / 4;
      const u = 1 - t;
      points.push({
        x: u * u * a.x + 2 * u * t * mid.x + t * t * b.x,
        y: u * u * a.y + 2 * u * t * mid.y + t * t * b.y
      });
    }
    stroke(lines, soften(points));
  }
  function lengthsFor(count, turn) {
    return Array.from({ length: count }, (_, i) => LENGTHS[(i + turn) % LENGTHS.length]);
  }
  function spreadY(bands) {
    const ordered = [...bands].sort((a, b) => a.y - b.y);
    for (let i = 1; i < ordered.length; i += 1) {
      const need = Math.max(ordered[i - 1].thick, ordered[i].thick) + 2.4;
      if (Math.abs(ordered[i].y - ordered[i - 1].y) < need && Math.abs(ordered[i].y - ordered[i - 1].y) > 0.35) {
        ordered[i] = { ...ordered[i], y: ordered[i - 1].y + need };
      }
    }
    const overflow = ordered.length ? ordered[ordered.length - 1].y - (FIELD_SIZE - 2.2) : 0;
    if (overflow > 0.2) {
      for (let i = 0; i < ordered.length; i += 1) ordered[i] = { ...ordered[i], y: lim3(ordered[i].y - overflow) };
    }
    return ordered;
  }
  function compose(org, variant) {
    const flip = variant % 2 === 1;
    const count = org === "fragment" ? 2 + variant % 2 : 2 + (variant * 3 + 1) % 5;
    const lens = lengthsFor(Math.max(count, 4), variant + PLATE_ORGS.indexOf(org) + variant * PLATE_ORGS.length);
    const thick = 1.35 + variant % 3 * 0.12;
    const tiltFor = (i) => variant % 3 === 1 && i === count - 1 ? 0.1 * (flip ? -1 : 1) : i === 1 && variant % 4 === 0 ? 0.07 : 0;
    const bands = [];
    const xLeft = 2.1;
    const xRight = 17.6;
    if (org === "dominant") {
      const yLong = 5.2 + variant % 3 * 3.4;
      const long = lens[0] > 8 ? lens[0] : 11.4;
      const xLong = flip ? xRight - long : xLeft + variant % 2 * 0.6;
      bands.push(bandAt(xLong, long, yLong, thick + 0.25, 0, variant));
      for (let i = 1; i < count; i += 1) {
        const length = Math.min(6.2, lens[i]);
        const x2 = flip ? xLeft + i % 2 * 1.4 : xRight - length - i % 2 * 1.2;
        const y2 = yLong + (i % 2 === 0 ? -1 : 1) * (2.3 + i * 1.15);
        bands.push(bandAt(x2, length, y2, thick, tiltFor(i), variant + i));
      }
      return { org, bands: spreadY(bands), open: flip ? "right" : "left" };
    }
    if (org === "distributed") {
      const slots = [
        [2.2, 4.4],
        [10.5, 7.6],
        [3.4, 11.2],
        [11.2, 14.4],
        [6.2, 16.6]
      ];
      for (let i = 0; i < count; i += 1) {
        const slot = slots[(i + variant) % slots.length];
        const length = lens[(i * 2 + variant) % lens.length] * 0.72;
        const x2 = flip ? xRight - (slot[0] - 2) - length : slot[0];
        bands.push(bandAt(x2, length, slot[1] + variant % 3 * 0.35, thick, tiltFor(i), i + variant));
      }
      return { org, bands: spreadY(bands), open: variant % 2 === 0 ? "above" : "below" };
    }
    if (org === "stagger") {
      const gaps = [2.5, 3.6, 2.2, 4.1, 2.9];
      let y2 = 3.6 + variant % 3 * 0.4;
      for (let i = 0; i < count; i += 1) {
        const length = lens[i] * (i % 2 === 0 ? 0.78 : 0.55);
        const dockRight = i % 2 === (flip ? 0 : 1);
        const x2 = dockRight ? xRight - length : xLeft;
        bands.push(bandAt(x2, length, y2, thick, tiltFor(i), variant + i * 1.3));
        y2 += gaps[(i + variant) % gaps.length] + thick;
      }
      return { org, bands, open: flip ? "left" : "right" };
    }
    if (org === "cascade") {
      let y2 = 3.8;
      let x2 = flip ? 9.5 : 2;
      for (let i = 0; i < count; i += 1) {
        const length = 8.8 - i * 0.85 + variant % 3 * 0.4;
        const at2 = flip ? x2 - i * 1.35 : x2 + i * 1.45;
        bands.push(bandAt(at2, Math.max(3.2, length), y2, thick * (i === 0 ? 1.15 : 0.92), i === count - 1 ? tiltFor(i) : 0, variant + i));
        y2 += 2.15 + i % 2 * 0.85 + thick * 0.35;
      }
      return { org, bands, open: flip ? "left" : "right" };
    }
    if (org === "retreat") {
      const side = flip ? xRight : xLeft;
      let y2 = 3.8 + variant % 4 * 0.55;
      for (let i = 0; i < count; i += 1) {
        const length = Math.min(8.4, 3.8 + lens[i] * 0.42);
        const x2 = flip ? side - length - i % 2 * 0.8 : side + i % 3 * 0.7;
        bands.push(bandAt(x2, length, y2, thick, tiltFor(i), variant * 0.4 + i));
        y2 += 2.1 + i % 2 * 1.15;
      }
      return { org, bands, open: flip ? "left" : "right" };
    }
    if (org === "cluster") {
      const window2 = variant % 3 === 0 ? 3.6 : variant % 3 === 1 ? 7.2 : 11.4;
      for (let i = 0; i < count; i += 1) {
        const length = lens[i] * (i === variant % count ? 0.95 : 0.58);
        const x2 = (flip ? 8.2 : 2.4) + i % 2 * 1.6;
        bands.push(bandAt(x2, length, window2 + i * (1.55 + thick * 0.15), thick, tiltFor(i), i + 0.6));
      }
      return { org, bands, open: variant % 3 === 0 ? "below" : "above" };
    }
    if (org === "fragment") {
      const levels2 = 2 + variant % 2;
      for (let level = 0; level < levels2; level += 1) {
        const y2 = 4.2 + level * (3.4 + variant % 3 * 0.45);
        const leftW = 3.4 + variant % 3 * 1.1 + level * 0.4;
        const rightW = 5.2 - level * 0.7 + variant % 2 * 1.3;
        const gap = 1.4 + (level + variant) % 3 * 0.9;
        const leftX = flip ? 3.2 + level * 0.5 : 2.2;
        bands.push(bandAt(leftX, leftW, y2, thick * 0.95, 0, level));
        bands.push(bandAt(leftX + leftW + gap, rightW, y2 + (level === 1 ? 0.28 : 0), thick, tiltFor(level), level + 2));
      }
      return { org, bands, open: "above" };
    }
    let y = 4 + variant % 3 * 0.6;
    let x = flip ? 8.5 : 2.3;
    for (let i = 0; i < count; i += 1) {
      const length = i % 2 === 0 ? 9.2 + variant % 2 : 6.4;
      bands.push(bandAt(x, length, y, thick + (i === 0 ? 0.2 : 0), tiltFor(i), variant + i));
      x = flip ? x - 1.6 : x + 1.5;
      y += 2.4 + thick * 0.2;
    }
    return { org, bands, open: flip ? "left" : "right" };
  }
  function connect(lines, bands, index2, open) {
    const mode = index2 % 4;
    const ordered = [...bands].sort((a, b) => a.y - b.y);
    if (mode !== 0) {
      for (let i = 0; i < ordered.length - 1; i += 1) {
        if (mode === 1 && i % 2 === 1) continue;
        const top = ordered[i];
        const bot = ordered[i + 1];
        const from = { x: top.x0 + (top.x1 - top.x0) * (0.3 + i % 3 * 0.2), y: top.y + top.thick / 2 };
        const to = { x: bot.x0 + (bot.x1 - bot.x0) * (0.7 - i % 2 * 0.25), y: bot.y - bot.thick / 2 };
        if (Math.hypot(to.x - from.x, to.y - from.y) < 1.2) continue;
        vein(lines, from, to, (index2 % 2 === 0 ? 1 : -1) * (0.6 + i % 2 * 0.4));
      }
    }
    const host = ordered[index2 % ordered.length];
    if (!host) return;
    const fromEnd = open === "left" || open === "above" && index2 % 2 === 0;
    const origin = { x: fromEnd ? host.x0 + 0.3 : host.x1 - 0.3, y: host.y };
    const reach = open === "left" ? { x: origin.x - 2.8, y: origin.y + 1.6 } : open === "right" ? { x: origin.x + 2.8, y: origin.y - 1.4 } : open === "above" ? { x: origin.x + 1.2, y: origin.y - 2.6 } : { x: origin.x - 1.1, y: origin.y + 2.6 };
    vein(lines, origin, reach, 0.8);
    if (ordered.length > 2 && index2 % 3 === 0) {
      const other = ordered[(index2 + 2) % ordered.length];
      vein(lines, { x: host.x1, y: host.y }, { x: other.x0, y: other.y }, -1.1);
    }
  }
  function fit(bands) {
    if (bands.length < 2) return bands.map((band) => ({ ...band, y: lim3(band.y) }));
    const min = Math.min(...bands.map((band) => band.y));
    const max = Math.max(...bands.map((band) => band.y));
    const span4 = Math.max(0.01, max - min);
    const scale = Math.min(1, 12.8 / span4);
    const lo = 3.5 + (16.4 - 3.5 - span4 * scale) * 0.5;
    return bands.map((band) => ({ ...band, y: lim3(lo + (band.y - min) * scale) }));
  }
  function plateFigure(plan) {
    const org = PLATE_ORGS.includes(plan.org) ? plan.org : PLATE_ORGS[plan.index % PLATE_ORGS.length];
    const variant = PLATE_VARIANTS.includes(String(plan.variant)) ? Number(plan.variant) : Math.floor(plan.index / PLATE_ORGS.length);
    const slot = PLATE_ORGS.indexOf(org) + variant * PLATE_ORGS.length;
    return { org, variant, slot };
  }
  function sectionLines(plan) {
    const figure = plateFigure(plan);
    const composed = compose(figure.org, figure.variant);
    composed.bands = fit(composed.bands);
    const rng = mulberry32((plan.seed ^ Math.imul(plan.index + 1, 2654435769)) >>> 0);
    const lines = [];
    for (const band of composed.bands) drawBand(lines, band, rng);
    connect(lines, composed.bands, figure.slot, composed.open);
    return lines.slice(0, 640);
  }
  function planInsertedHorizontalPlate(seed, attempt = 0, index2 = 0) {
    const slot = (index2 % 100 + 100) % 100;
    const variant = Math.floor(slot / PLATE_ORGS.length);
    return {
      index: slot,
      seed: (seed ^ Math.imul(attempt + 1, 2246822507) ^ slot) >>> 0,
      org: PLATE_ORGS[slot % PLATE_ORGS.length],
      variant: String(variant)
    };
  }
  function linesFromInsertedPlate(plan) {
    return sectionLines(plan);
  }
  function attractorsFromInsertedPlate(plan) {
    return linesFromInsertedPlate(plan).map((line) => ({
      kind: "line",
      x: line.x,
      y: line.y,
      x2: line.x2,
      y2: line.y2,
      radius: 0.32,
      strength: 1
    }));
  }

  // lib/skill1/run-linear-edge-gallery.ts
  var CENTER3 = (FIELD_SIZE - 1) / 2;
  var EDGE4 = 1.15;
  var lim4 = (value) => Math.min(FIELD_SIZE - EDGE4, Math.max(EDGE4, value));
  var HAIR = 0.34;
  var SPINE = -7.15;
  var EDGE_FAMILIES = [
    "beaded",
    "bow",
    "stepped",
    "comb",
    "notched",
    "folded",
    "taper",
    "bays",
    "gapped",
    "wave",
    "rail",
    "offset",
    "hook",
    "stitch",
    "paired",
    "pocket"
  ];
  var EDGE_GROWTHS = ["filament", "sparse", "sharp", "committed"];
  function ln(u, v, u2, v2, strength = 1.15) {
    return { kind: "line", u, v, u2, v2, radius: HAIR, strength };
  }
  function cv(u, v, u2, v2, cu, cv3, strength = 1.1) {
    return { kind: "curve", u, v, u2, v2, cu, cv: cv3, radius: HAIR, strength };
  }
  function node(u, v, radius, strength = 0.82) {
    return { kind: "point", u, v, radius, strength };
  }
  function pore(u, v, radius) {
    return { kind: "ring", u, v, radius: 2.4 + radius * 2.4, strength: 0.62, hole: true };
  }
  function along2(count, span4, phase) {
    const n = Math.max(2, count);
    const start = -span4;
    return Array.from({ length: n }, (_, i) => {
      const u = i / (n - 1);
      return start + (u + phase) % 1 * span4 * 2;
    }).sort((a, b) => a - b);
  }
  var BUILD = {
    beaded: (cycle) => {
      const count = 5 + cycle % 4;
      const span4 = 7.2 + cycle % 3 * 0.45;
      const xs = along2(count, span4, cycle * 0.07);
      const marks = [ln(xs[0], SPINE, xs[xs.length - 1], SPINE)];
      xs.forEach((x, i) => {
        marks.push(node(x, SPINE, 0.48 + i % 2 * 0.16 + cycle % 2 * 0.08));
        if (i < xs.length - 1) marks.push(pore((x + xs[i + 1]) / 2, SPINE + 0.15, 0.38 + cycle % 3 * 0.06));
      });
      return marks;
    },
    bow: (cycle) => {
      const span4 = 7.4;
      const lift = 1.5 + cycle % 4 * 0.45;
      const marks = [cv(-span4, SPINE, span4, SPINE, 0, SPINE + lift, 1.2)];
      const count = 4 + cycle % 3;
      for (let i = 0; i < count; i += 1) {
        const t = (i + 0.5) / count;
        const u = -span4 + t * span4 * 2;
        const v = SPINE + Math.sin(t * Math.PI) * lift * 0.55;
        marks.push(node(u, v, 0.55 + cycle % 2 * 0.12));
        if (i % 2 === 0) marks.push(pore(u, v + 0.7 + cycle % 3 * 0.15, 0.36));
      }
      return marks;
    },
    stepped: (cycle) => {
      const steps = 4 + cycle % 3;
      const rise = 0.7 + cycle % 3 * 0.22;
      const run = 2.4 + cycle % 2 * 0.35;
      const marks = [];
      let u = -7.2;
      let v = SPINE;
      for (let i = 0; i < steps; i += 1) {
        const next = u + run;
        marks.push(ln(u, v, next, v, 1.05));
        marks.push(node(u + run * 0.5, v, 0.5 + (i === steps - 1 ? 0.2 : 0)));
        if (i < steps - 1) {
          marks.push(ln(next, v, next, v + rise, 0.7));
          marks.push(pore(next, v + rise * 0.45, 0.32));
        }
        u = next;
        v += rise;
      }
      return marks;
    },
    comb: (cycle) => {
      const teeth = 4 + cycle % 3;
      const span4 = 7.3;
      const marks = [ln(-span4, SPINE, span4, SPINE)];
      for (let i = 0; i < teeth; i += 1) {
        const u = -span4 + (i + 0.5) / teeth * span4 * 2;
        const depth = 1.6 + i % 2 * (0.7 + cycle % 3 * 0.25);
        marks.push(ln(u, SPINE, u, SPINE + depth, 0.55));
        marks.push(node(u, SPINE, 0.46));
        marks.push(node(u, SPINE + depth, 0.62 + cycle % 2 * 0.1));
      }
      return marks;
    },
    notched: (cycle) => {
      const span4 = 7.6;
      const pores = 3 + cycle % 3;
      const marks = [ln(-span4, SPINE, span4, SPINE, 1.2)];
      for (let i = 0; i < pores; i += 1) {
        const u = -span4 * 0.72 + i / Math.max(1, pores - 1) * span4 * 1.44;
        marks.push(pore(u, SPINE, 0.55 + cycle % 2 * 0.16));
        marks.push(node(u + (i % 2 ? 1.15 : -1.15), SPINE, 0.58));
      }
      return marks;
    },
    folded: (cycle) => {
      const arm = 6.2 + cycle % 3 * 0.5;
      const turn = 3.2 + cycle % 4 * 0.45;
      const end = cycle % 2 === 0 ? arm : -arm;
      const marks = [
        ln(-arm, SPINE, arm, SPINE),
        ln(end, SPINE, end, SPINE + turn, 0.9)
      ];
      const count = 4 + cycle % 2;
      for (let i = 0; i < count; i += 1) {
        const u = -arm + i / (count - 1) * arm * 2;
        marks.push(node(u, SPINE, 0.5));
      }
      marks.push(node(end, SPINE + turn * 0.65, 0.7));
      marks.push(pore(end * 0.35, SPINE + 0.2, 0.4));
      marks.push(pore(end, SPINE + turn * 0.35, 0.34));
      return marks;
    },
    taper: (cycle) => {
      const count = 6 + cycle % 2;
      const span4 = 7.5;
      const dir = cycle % 2 === 0 ? 1 : -1;
      const marks = [ln(-span4, SPINE, span4, SPINE)];
      for (let i = 0; i < count; i += 1) {
        const t = i / (count - 1);
        const u = -span4 + t * span4 * 2;
        const grow = dir > 0 ? t : 1 - t;
        marks.push(node(u, SPINE, 0.36 + grow * 0.7));
        if (grow < 0.55 && i % 2 === 0) marks.push(pore(u, SPINE + 0.55, 0.32 + grow));
      }
      marks.push(node(dir * span4 * 0.92, SPINE + 1.15, 0.95));
      return marks;
    },
    bays: (cycle) => {
      const bays = 3 + cycle % 2;
      const span4 = 7.4;
      const marks = [ln(-span4, SPINE, span4, SPINE)];
      for (let i = 0; i < bays; i += 1) {
        const u = -span4 * 0.7 + i / Math.max(1, bays - 1) * span4 * 1.4;
        const depth = 1.8 + cycle % 3 * 0.4 + i % 2 * 0.35;
        const half = 0.85 + cycle % 2 * 0.25;
        marks.push(cv(u - half, SPINE, u + half, SPINE, u, SPINE + depth, 0.85));
        marks.push(node(u, SPINE + depth * 0.72, 0.58));
        marks.push(pore(u, SPINE + 0.25, 0.3));
      }
      return marks;
    },
    gapped: (cycle) => {
      const parts = 3 + cycle % 2;
      const span4 = 7.6;
      const gap = 0.85 + cycle % 3 * 0.28;
      const marks = [];
      const width = (span4 * 2 - gap * (parts - 1)) / parts;
      let u = -span4;
      for (let i = 0; i < parts; i += 1) {
        const next = u + width;
        marks.push(ln(u, SPINE, next, SPINE));
        marks.push(node(u + width * 0.35, SPINE, 0.48));
        marks.push(node(u + width * 0.7, SPINE, 0.62));
        if (i < parts - 1) {
          marks.push(pore(next + gap * 0.5, SPINE, 0.42 + cycle % 2 * 0.1));
          marks.push(ln(next, SPINE, next + gap, SPINE + 0.15, 0.28));
        }
        u = next + gap;
      }
      return marks;
    },
    wave: (cycle) => {
      const waves = 2 + cycle % 2;
      const span4 = 7.5;
      const amp = 0.85 + cycle % 3 * 0.35;
      const marks = [];
      const steps = 6 + cycle % 2;
      let prevU = -span4;
      let prevV = SPINE;
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        const u = -span4 + t * span4 * 2;
        const v = SPINE + Math.sin(t * Math.PI * waves) * amp;
        marks.push(ln(prevU, prevV, u, v, 1.05));
        if (i % 2 === 0) marks.push(node(u, v, 0.52 + cycle % 2 * 0.12));
        else marks.push(pore(u, v + 0.45, 0.32));
        prevU = u;
        prevV = v;
      }
      return marks;
    },
    rail: (cycle) => {
      const span4 = 7.2;
      const gap = 1.15 + cycle % 3 * 0.28;
      const ties = 3 + cycle % 2;
      const marks = [ln(-span4, SPINE, span4, SPINE, 1.15), ln(-span4 * 0.92, SPINE + gap, span4 * 0.92, SPINE + gap, 0.72)];
      for (let i = 0; i < ties; i += 1) {
        const u = -span4 * 0.6 + i / Math.max(1, ties - 1) * span4 * 1.2;
        marks.push(ln(u, SPINE, u, SPINE + gap, 0.4));
        marks.push(node(u, SPINE + gap * 0.5, 0.5));
      }
      marks.push(pore(0, SPINE + gap * 0.5, 0.36 + cycle % 2 * 0.08));
      return marks;
    },
    offset: (cycle) => {
      const count = 5 + cycle % 3;
      const span4 = 7.1;
      const reach = 0.9 + cycle % 3 * 0.28;
      const marks = [ln(-span4, SPINE, span4, SPINE)];
      for (let i = 0; i < count; i += 1) {
        const u = -span4 + (i + 0.5) / count * span4 * 2;
        const v = SPINE + reach * (i % 2 === 0 ? 1 : 0.35);
        marks.push(ln(u, SPINE, u, v, 0.4));
        marks.push(node(u, v, 0.5 + i % 2 * 0.18));
        if (i % 2 === 1) marks.push(pore(u, SPINE + 0.2, 0.3));
      }
      return marks;
    },
    hook: (cycle) => {
      const span4 = 7.3;
      const hook = 2.6 + cycle % 4 * 0.4;
      const end = cycle % 2 === 0 ? span4 : -span4;
      const marks = [
        ln(-span4, SPINE, span4, SPINE),
        cv(end, SPINE, end * 0.72, SPINE + hook, end, SPINE + hook * 0.45, 0.9)
      ];
      const count = 5 + cycle % 2;
      for (let i = 0; i < count; i += 1) {
        const u = -span4 + i / (count - 1) * span4 * 2;
        marks.push(node(u, SPINE, 0.48));
        if (i % 2 === 0) marks.push(pore(u, SPINE + 0.5, 0.3));
      }
      marks.push(node(end * 0.78, SPINE + hook * 0.7, 0.72));
      return marks;
    },
    stitch: (cycle) => {
      const stitches = 4 + cycle % 3;
      const span4 = 7.4;
      const marks = [ln(-span4, SPINE, span4, SPINE, 1.2)];
      for (let i = 0; i < stitches; i += 1) {
        const u = -span4 * 0.8 + i / Math.max(1, stitches - 1) * span4 * 1.6;
        const len = 1.1 + i % 2 * (0.6 + cycle % 2 * 0.3);
        marks.push(ln(u, SPINE - 0.25, u, SPINE + len, 0.42));
        marks.push(node(u, SPINE, 0.44));
        marks.push(pore(u + 0.7, SPINE + 0.15, 0.28));
      }
      return marks;
    },
    paired: (cycle) => {
      const pairs = 3 + cycle % 2;
      const span4 = 7;
      const marks = [ln(-span4, SPINE, span4, SPINE)];
      for (let i = 0; i < pairs; i += 1) {
        const u = -span4 * 0.75 + i / Math.max(1, pairs - 1) * span4 * 1.5;
        const spread = 0.55 + cycle % 3 * 0.12;
        marks.push(node(u - spread, SPINE, 0.52));
        marks.push(node(u + spread, SPINE, 0.52 + cycle % 2 * 0.12));
        if (i < pairs - 1) {
          const mid = u + span4 * 1.5 / Math.max(1, pairs - 1) / 2;
          marks.push(pore(mid, SPINE + 0.2, 0.4 + cycle % 2 * 0.08));
        }
      }
      return marks;
    },
    pocket: (cycle) => {
      const pockets = 3;
      const span4 = 6.8;
      const depth = 2.1 + cycle % 4 * 0.35;
      const marks = [ln(-span4, SPINE, span4, SPINE, 1.05)];
      for (let i = 0; i < pockets; i += 1) {
        const u = -span4 * 0.65 + i / (pockets - 1) * span4 * 1.3;
        marks.push(cv(u - 1.05, SPINE, u + 1.05, SPINE, u, SPINE + depth, 0.8));
        marks.push(node(u, SPINE + depth * 0.62, 0.78 + cycle % 2 * 0.12));
        marks.push(pore(u, SPINE + 0.35, 0.34));
      }
      return marks;
    }
  };
  var TURNS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  function planLinearEdgeGallery(seed, attempt = 0, index2 = 0) {
    const cycle = Math.floor(index2 / EDGE_FAMILIES.length);
    const kind = EDGE_FAMILIES[(index2 + attempt * 5) % EDGE_FAMILIES.length];
    const growth = EDGE_GROWTHS[(cycle + attempt) % EDGE_GROWTHS.length];
    return {
      kind,
      growth,
      index: index2,
      cycle,
      turn: TURNS[(cycle + index2) % TURNS.length],
      flip: cycle % 3 !== 1
    };
  }
  function attractorsFromLinearEdgeGallery(plan) {
    const locals = BUILD[plan.kind](plan.cycle % 6);
    const cos = Math.cos(plan.turn);
    const sin = Math.sin(plan.turn);
    const slide = (plan.cycle % 5 - 2) * 1.35;
    const scaleU = 0.82 + plan.cycle % 4 * 0.08;
    const scaleV = 0.78 + plan.cycle % 5 * 0.1;
    const to = (u, v) => {
      const su = (plan.flip ? -u : u) * scaleU + slide;
      const sv = v * scaleV;
      return { x: lim4(CENTER3 + su * cos - sv * sin), y: lim4(CENTER3 + su * sin + sv * cos) };
    };
    const placed = locals.map((mark) => {
      const a = to(mark.u, mark.v);
      const out = { kind: mark.kind, x: a.x, y: a.y, radius: mark.radius, strength: mark.strength };
      if (mark.hole) out.hole = true;
      if (mark.kind === "line" || mark.kind === "curve") {
        const b = to(mark.u2 ?? mark.u, mark.v2 ?? mark.v);
        out.x2 = b.x;
        out.y2 = b.y;
      }
      if (mark.kind === "curve") {
        const c = to(mark.cu ?? mark.u, mark.cv ?? mark.v);
        out.cx = c.x;
        out.cy = c.y;
      }
      return out;
    });
    return separateEdgeVoids(placed);
  }
  function separateEdgeVoids(marks) {
    const holes = marks.filter((mark) => mark.hole && mark.kind === "ring");
    const rest = marks.filter((mark) => mark.kind !== "point" && !(mark.hole && mark.kind === "ring"));
    const kept = [];
    for (const hole2 of holes) {
      const radius = Math.min(3.6, Math.max(2.7, hole2.radius ?? 2.8));
      const next = { ...hole2, radius };
      const crowded = kept.some((other) => Math.hypot(other.x - next.x, other.y - next.y) < radius + (other.radius ?? radius) * 0.85);
      if (crowded) continue;
      kept.push(next);
    }
    return [...rest, ...kept];
  }

  // lib/skill1/run-linear-gallery.ts
  var CENTER4 = (FIELD_SIZE - 1) / 2;
  var EDGE5 = 1.2;
  var lim5 = (value) => Math.min(FIELD_SIZE - EDGE5, Math.max(EDGE5, value));
  function frame4(rng) {
    return {
      r: (min, max) => min + rng() * (max - min),
      int: (min, max) => Math.floor(min + rng() * (max - min + 1)),
      chance: (p) => rng() < p,
      pick: (items) => items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
    };
  }
  var GALLERY_FAMILIES = [
    "enfilade",
    "dogleg",
    "alcove",
    "switchback",
    "meander",
    "fork",
    "bay",
    "ladder",
    "braid",
    "islands",
    "hook",
    "fan",
    "arcade",
    "loop",
    "broken",
    "wrap"
  ];
  var GROWTH_MODES2 = [
    "filament",
    "mass",
    "sparse",
    "bloom",
    "sharp",
    "heavy",
    "wander",
    "committed"
  ];
  function pt(x, y, radius, strength) {
    return { kind: "point", x: lim5(x), y: lim5(y), radius, strength };
  }
  function ln2(x, y, x2, y2, radius, strength, hole2 = false) {
    return { kind: "line", x: lim5(x), y: lim5(y), x2: lim5(x2), y2: lim5(y2), radius, strength, hole: hole2 || void 0 };
  }
  function ring(x, y, radius, strength) {
    return { kind: "ring", x: lim5(x), y: lim5(y), radius, strength, hole: true };
  }
  function cv2(x, y, x2, y2, cx, cy, radius, strength, hole2 = false) {
    return { kind: "curve", x: lim5(x), y: lim5(y), x2: lim5(x2), y2: lim5(y2), cx: lim5(cx), cy: lim5(cy), radius, strength, hole: hole2 || void 0 };
  }
  function rotate2(x, y, plan) {
    const dx = (x - CENTER4) * plan.scale * (plan.flip ? -1 : 1);
    const dy = (y - CENTER4) * plan.scale;
    const c = Math.cos(plan.twist);
    const s = Math.sin(plan.twist);
    return {
      x: plan.originX + dx * c - dy * s,
      y: plan.originY + dx * s + dy * c
    };
  }
  function place2(marks, plan) {
    const mapped = marks.map((mark) => {
      const a = rotate2(mark.x, mark.y, plan);
      const out = { ...mark, x: a.x, y: a.y, radius: (mark.radius ?? 1.2) * plan.scale };
      if (mark.x2 != null && mark.y2 != null) {
        const b = rotate2(mark.x2, mark.y2, plan);
        out.x2 = b.x;
        out.y2 = b.y;
      }
      if (mark.cx != null && mark.cy != null) {
        const bend = rotate2(mark.cx, mark.cy, plan);
        out.cx = bend.x;
        out.cy = bend.y;
      }
      return out;
    });
    const box2 = boundsOf(mapped);
    const width = Math.max(0.5, box2.maxX - box2.minX);
    const height = Math.max(0.5, box2.maxY - box2.minY);
    const margin = 1.2;
    const fit2 = Math.min((FIELD_SIZE - margin * 2) / width, (FIELD_SIZE - margin * 2) / height, 1.12);
    const shift = (x, y) => ({
      x: lim5(CENTER4 + (x - box2.cx) * fit2),
      y: lim5(CENTER4 + (y - box2.cy) * fit2)
    });
    return mapped.map((mark) => {
      const a = shift(mark.x, mark.y);
      const out = { ...mark, x: a.x, y: a.y, radius: Math.max(0.16, (mark.radius ?? 1.2) * fit2) };
      if (mark.x2 != null && mark.y2 != null) {
        const b = shift(mark.x2, mark.y2);
        out.x2 = b.x;
        out.y2 = b.y;
      }
      if (mark.cx != null && mark.cy != null) {
        const bend = shift(mark.cx, mark.cy);
        out.cx = bend.x;
        out.cy = bend.y;
      }
      return out;
    });
  }
  function along3(count, span4, y, f, jitter = 0.2) {
    const start = CENTER4 - span4;
    const step = span4 * 2 / Math.max(1, count - 1);
    return Array.from({ length: count }, (_, i) => ({
      x: start + i * step + f.r(-jitter, jitter),
      y: y + f.r(-jitter * 0.6, jitter * 0.6)
    }));
  }
  function addSpine(marks, path2, width, style) {
    for (let i = 0; i < path2.length - 1; i += 1) {
      const a = path2[i];
      const b = path2[i + 1];
      if (style === "curve") {
        marks.push(cv2(a.x, a.y, b.x, b.y, (a.x + b.x) / 2, (a.y + b.y) / 2 + (b.x - a.x) * 0.08, width, 1.4));
      } else {
        marks.push(ln2(a.x, a.y, b.x, b.y, width, 1.4));
      }
    }
  }
  function addFragments(marks, path2, items, spine2) {
    for (const item of items) {
      const node3 = path2[Math.min(path2.length - 1, Math.max(0, item.at))];
      const x = node3.x;
      const y = node3.y + item.side * item.stem;
      marks.push(ln2(node3.x, node3.y, x, y, Math.min(0.4, spine2 * 0.9), 0.7));
      marks.push(pt(x, y, item.radius, 0.88));
    }
  }
  function compose2(path2, fragments, spine2, style) {
    const marks = [];
    addSpine(marks, path2, spine2, style);
    addFragments(marks, path2, fragments, spine2);
    return marks;
  }
  function boundsOf(marks) {
    let minX = FIELD_SIZE;
    let minY = FIELD_SIZE;
    let maxX = 0;
    let maxY = 0;
    for (const item of marks) {
      minX = Math.min(minX, item.x, item.x2 ?? item.x, item.cx ?? item.x);
      minY = Math.min(minY, item.y, item.y2 ?? item.y, item.cy ?? item.y);
      maxX = Math.max(maxX, item.x, item.x2 ?? item.x, item.cx ?? item.x);
      maxY = Math.max(maxY, item.y, item.y2 ?? item.y, item.cy ?? item.y);
    }
    return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }
  function organicBite(x, y, radius, f) {
    const bites = [ring(x, y, radius, 1)];
    const extra = f.int(1, 3);
    for (let i = 0; i < extra; i += 1) {
      const a = f.r(0, Math.PI * 2);
      const d = radius * f.r(0.28, 0.78);
      bites.push(ring(x + Math.cos(a) * d, y + Math.sin(a) * d, radius * f.r(0.38, 0.78), 0.82));
    }
    return bites;
  }
  function wavyVoid(marks, f) {
    const { minX, minY, maxX, maxY, cx, cy } = boundsOf(marks);
    const horizontal = maxX - minX >= maxY - minY;
    const pad = f.r(0.55, 1.25);
    const n = f.int(4, 6);
    const amp = f.r(0.7, 1.8);
    const waves = f.r(1.1, 2.6);
    const phase = f.r(0, Math.PI * 2);
    const stations = [];
    for (let i = 0; i < n; i += 1) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const wobble = Math.sin(t * Math.PI * waves + phase) * amp;
      stations.push(
        horizontal ? { x: minX + pad + (maxX - minX - pad * 2) * t, y: cy + wobble } : { x: cx + wobble, y: minY + pad + (maxY - minY - pad * 2) * t }
      );
    }
    const voids = [];
    for (let i = 0; i < stations.length - 1; i += 1) {
      const a = stations[i];
      const b = stations[i + 1];
      const bow = f.r(-1.15, 1.15);
      voids.push(
        cv2(
          a.x,
          a.y,
          b.x,
          b.y,
          (a.x + b.x) / 2 + (horizontal ? 0 : bow),
          (a.y + b.y) / 2 + (horizontal ? bow : 0),
          f.r(0.42, 0.98),
          1.05,
          true
        )
      );
    }
    const bites = f.int(2, 4);
    for (let i = 0; i < bites; i += 1) {
      const t = f.r(0.15, 0.85);
      const off = f.r(-1.4, 1.4);
      const x = horizontal ? minX + pad + (maxX - minX - pad * 2) * t : cx + off;
      const y = horizontal ? cy + off : minY + pad + (maxY - minY - pad * 2) * t;
      voids.push(...organicBite(x, y, f.r(0.55, 1.15), f));
    }
    return [...marks, ...voids];
  }
  function carveOrganicVoid(marks, f) {
    return wavyVoid(marks, f);
  }
  function addWraps(marks, f) {
    const { cx, cy, minX, maxX, minY, maxY } = boundsOf(marks);
    const rx = Math.max(2.1, (maxX - minX) * 0.38);
    const ry = Math.max(1.8, (maxY - minY) * 0.48);
    const wraps = f.int(4, 7);
    const extra = [];
    for (let i = 0; i < wraps; i += 1) {
      const a0 = i / wraps * Math.PI * 2 + f.r(-0.28, 0.28);
      const span4 = f.r(1.45, 2.7);
      const rIn = f.r(0.85, 1.15);
      const rOut = f.r(1.25, 1.85);
      const p1 = { x: cx + Math.cos(a0) * rx * rIn, y: cy + Math.sin(a0) * ry * rIn };
      const p2 = {
        x: cx + Math.cos(a0 + span4) * rx * rIn * f.r(0.86, 1.18),
        y: cy + Math.sin(a0 + span4) * ry * rIn * f.r(0.86, 1.18)
      };
      const c = { x: cx + Math.cos(a0 + span4 * 0.5) * rx * rOut, y: cy + Math.sin(a0 + span4 * 0.5) * ry * rOut };
      extra.push(cv2(p1.x, p1.y, p2.x, p2.y, c.x, c.y, f.r(0.18, 0.4), f.r(0.55, 0.95)));
      if (f.chance(0.55)) {
        const bead = a0 + span4 * f.r(0.28, 0.72);
        extra.push(pt(cx + Math.cos(bead) * rx * 1.25, cy + Math.sin(bead) * ry * 1.25, f.r(0.42, 0.82), 0.68));
      }
    }
    return marks.concat(extra);
  }
  function wrapAroundCenter(f) {
    const marks = [];
    const coreAng = f.r(-0.55, 0.55);
    const coreLen = f.r(1.4, 2.6);
    const dx = Math.cos(coreAng) * coreLen;
    const dy = Math.sin(coreAng) * coreLen;
    marks.push(pt(CENTER4, CENTER4, f.r(1.5, 2.3), 1.85));
    marks.push(ln2(CENTER4 - dx, CENTER4 - dy, CENTER4 + dx, CENTER4 + dy, f.r(0.55, 0.95), 1.7));
    const wraps = f.int(5, 8);
    for (let i = 0; i < wraps; i += 1) {
      const a0 = i / wraps * Math.PI * 2 + f.r(-0.18, 0.18);
      const span4 = f.r(1.7, 2.9);
      const rIn = f.r(0.7, 1.35);
      const rOut = f.r(3, 5.2);
      const rEnd = f.r(2.2, 4);
      const p1 = { x: CENTER4 + Math.cos(a0) * rIn, y: CENTER4 + Math.sin(a0) * rIn };
      const p2 = { x: CENTER4 + Math.cos(a0 + span4) * rEnd, y: CENTER4 + Math.sin(a0 + span4) * rEnd };
      const c = { x: CENTER4 + Math.cos(a0 + span4 * 0.45) * rOut, y: CENTER4 + Math.sin(a0 + span4 * 0.45) * rOut };
      marks.push(cv2(p1.x, p1.y, p2.x, p2.y, c.x, c.y, f.r(0.2, 0.38), f.r(1.15, 1.55)));
      if (f.chance(0.7)) {
        marks.push(pt(p2.x, p2.y, f.r(0.45, 0.85), 0.78));
      }
    }
    return marks;
  }
  function familyMarks(kind, f) {
    if (kind === "enfilade") {
      const n = f.int(5, 7);
      const path2 = along3(n, f.r(6.8, 8.1), CENTER4, f, 0.12);
      return compose2(
        path2,
        path2.map((_, i) => ({ at: i, side: i % 2 ? 1 : -1, stem: f.r(1.4, 2), radius: f.r(0.7, 1.05) })),
        f.r(0.22, 0.34),
        "line"
      );
    }
    if (kind === "dogleg") {
      const mid = CENTER4 + f.r(-1.2, 1.2);
      const path2 = [
        { x: CENTER4 - 7.4, y: CENTER4 - 2.8 },
        { x: mid, y: CENTER4 - 2.8 },
        { x: mid, y: CENTER4 + 3 },
        { x: CENTER4 + 7.2, y: CENTER4 + 3 }
      ];
      return compose2(
        path2,
        [
          { at: 0, side: 1, stem: f.r(1.6, 2.4), radius: f.r(1.5, 2.2) },
          { at: 1, side: -1, stem: f.r(1.3, 2.1), radius: f.r(1.1, 1.7) },
          { at: 2, side: 1, stem: f.r(1.4, 2.2), radius: f.r(1.2, 1.9) },
          { at: 3, side: -1, stem: f.r(1.6, 2.5), radius: f.r(1.5, 2.2) }
        ],
        f.r(0.28, 0.44),
        "line"
      );
    }
    if (kind === "alcove") {
      const path2 = along3(4, 7, CENTER4 + 1.6, f, 0.15);
      return compose2(
        path2,
        [
          { at: 0, side: -1, stem: f.r(2.6, 3.8), radius: f.r(1.3, 1.9) },
          { at: 1, side: -1, stem: f.r(3.2, 4.4), radius: f.r(1.6, 2.3) },
          { at: 2, side: -1, stem: f.r(2.4, 3.6), radius: f.r(1.2, 1.8) },
          { at: 3, side: -1, stem: f.r(2.8, 4), radius: f.r(1.4, 2) }
        ],
        f.r(0.4, 0.7),
        "line"
      );
    }
    if (kind === "switchback") {
      const y0 = CENTER4 - 3.2;
      const y1 = CENTER4;
      const y2 = CENTER4 + 3.2;
      const path2 = [
        { x: CENTER4 - 7, y: y0 },
        { x: CENTER4 + 5.4, y: y0 },
        { x: CENTER4 + 5.4, y: y1 },
        { x: CENTER4 - 5.4, y: y1 },
        { x: CENTER4 - 5.4, y: y2 },
        { x: CENTER4 + 7, y: y2 }
      ];
      return compose2(
        path2,
        [
          { at: 0, side: -1, stem: f.r(1.1, 1.7), radius: f.r(1, 1.5) },
          { at: 1, side: -1, stem: f.r(1.1, 1.7), radius: f.r(1, 1.5) },
          { at: 3, side: 1, stem: f.r(1, 1.6), radius: f.r(0.95, 1.45) },
          { at: 5, side: 1, stem: f.r(1.1, 1.8), radius: f.r(1.1, 1.7) }
        ],
        f.r(0.24, 0.38),
        "line"
      );
    }
    if (kind === "meander") {
      const path2 = [
        { x: CENTER4 - 7.3, y: CENTER4 + 2.6 },
        { x: CENTER4 - 2.4, y: CENTER4 - 2.8 },
        { x: CENTER4 + 2.4, y: CENTER4 + 2.8 },
        { x: CENTER4 + 7.3, y: CENTER4 - 2.4 }
      ];
      return compose2(
        path2,
        [
          { at: 0, side: 1, stem: f.r(1.5, 2.3), radius: f.r(1.2, 1.9) },
          { at: 1, side: -1, stem: f.r(1.6, 2.5), radius: f.r(1.3, 2) },
          { at: 2, side: 1, stem: f.r(1.5, 2.4), radius: f.r(1.2, 1.9) },
          { at: 3, side: -1, stem: f.r(1.5, 2.3), radius: f.r(1.2, 1.9) }
        ],
        f.r(0.26, 0.42),
        "curve"
      );
    }
    if (kind === "fork") {
      const split = CENTER4 + f.r(-0.8, 0.8);
      const marks = [
        ln2(CENTER4 - 7.4, CENTER4, split, CENTER4, f.r(0.28, 0.48), 1.5),
        ln2(split, CENTER4, CENTER4 + 6.8, CENTER4 - 3.4, f.r(0.22, 0.4), 1.25),
        ln2(split, CENTER4, CENTER4 + 6.8, CENTER4 + 3.4, f.r(0.22, 0.4), 1.25),
        pt(CENTER4 - 7.4, CENTER4, f.r(1.1, 1.8), 1.05),
        pt(CENTER4 + 6.8, CENTER4 - 3.4, f.r(1.3, 2.1), 1),
        pt(CENTER4 + 6.8, CENTER4 + 3.4, f.r(1.3, 2.1), 1),
        pt(split, CENTER4, f.r(0.7, 1.2), 0.85)
      ];
      return marks;
    }
    if (kind === "bay") {
      const path2 = along3(3, 6.4, CENTER4, f, 0.1);
      return compose2(
        path2,
        [
          { at: 0, side: 1, stem: f.r(2, 2.8), radius: f.r(2, 2.7) },
          { at: 1, side: -1, stem: f.r(2.1, 3), radius: f.r(2.1, 2.8) },
          { at: 2, side: 1, stem: f.r(2, 2.8), radius: f.r(2, 2.7) }
        ],
        f.r(0.36, 0.58),
        "line"
      );
    }
    if (kind === "ladder") {
      const y0 = CENTER4 - f.r(2.4, 3.4);
      const y1 = CENTER4 + f.r(2.4, 3.4);
      const marks = [
        ln2(CENTER4 - 7.2, y0, CENTER4 + 7.2, y0, f.r(0.22, 0.38), 1.35),
        ln2(CENTER4 - 7.2, y1, CENTER4 + 7.2, y1, f.r(0.22, 0.38), 1.35)
      ];
      const rungs = f.int(4, 6);
      for (let i = 0; i < rungs; i += 1) {
        const x = CENTER4 - 6.4 + 12.8 * i / Math.max(1, rungs - 1) + f.r(-0.2, 0.2);
        marks.push(ln2(x, y0, x, y1, f.r(0.16, 0.3), 0.75));
        if (i === 0 || i === rungs - 1 || f.chance(0.55)) marks.push(pt(x, (y0 + y1) / 2, f.r(0.7, 1.3), 0.8));
      }
      return marks;
    }
    if (kind === "braid") {
      const marks = [
        cv2(CENTER4 - 7.2, CENTER4 - 2.2, CENTER4 + 7.2, CENTER4 + 2, CENTER4, CENTER4 + 3.6, f.r(0.22, 0.38), 1.3),
        cv2(CENTER4 - 7.2, CENTER4 + 2.2, CENTER4 + 7.2, CENTER4 - 2, CENTER4, CENTER4 - 3.6, f.r(0.22, 0.38), 1.3),
        pt(CENTER4 - 7.2, CENTER4 - 2.2, f.r(1.1, 1.8), 0.95),
        pt(CENTER4 + 7.2, CENTER4 + 2, f.r(1.2, 1.9), 0.95),
        pt(CENTER4 - 7.2, CENTER4 + 2.2, f.r(1, 1.7), 0.9),
        pt(CENTER4 + 7.2, CENTER4 - 2, f.r(1.1, 1.8), 0.9)
      ];
      return marks;
    }
    if (kind === "islands") {
      const nodes = [
        { x: CENTER4 - 6.6, y: CENTER4 + f.r(-2.2, 2.2) },
        { x: CENTER4 + f.r(-1.2, 1.2), y: CENTER4 + f.r(-3.2, 3.2) },
        { x: CENTER4 + 6.4, y: CENTER4 + f.r(-2.4, 2.4) }
      ];
      if (f.chance(0.5)) nodes.splice(2, 0, { x: CENTER4 + 2.4, y: CENTER4 + f.r(-3.6, 3.6) });
      const marks = [];
      for (let i = 0; i < nodes.length; i += 1) {
        marks.push(pt(nodes[i].x, nodes[i].y, f.r(1.6, 2.6), 1.1));
        if (i > 0) marks.push(ln2(nodes[i - 1].x, nodes[i - 1].y, nodes[i].x, nodes[i].y, f.r(0.12, 0.24), 0.7));
      }
      return marks;
    }
    if (kind === "hook") {
      const marks = [
        ln2(CENTER4 - 7.4, CENTER4 + 2.2, CENTER4 + 4.2, CENTER4 + 2.2, f.r(0.26, 0.44), 1.4),
        cv2(CENTER4 + 4.2, CENTER4 + 2.2, CENTER4 + 1.2, CENTER4 - 3.6, CENTER4 + 7.4, CENTER4 - 1.4, f.r(0.24, 0.4), 1.25),
        pt(CENTER4 - 7.4, CENTER4 + 2.2, f.r(1, 1.6), 0.9),
        pt(CENTER4 + 1.2, CENTER4 - 3.6, f.r(1.5, 2.4), 1.1),
        pt(CENTER4 + 4.2, CENTER4 + 2.2, f.r(0.7, 1.2), 0.75)
      ];
      return marks;
    }
    if (kind === "fan") {
      const origin = { x: CENTER4 - 6.6, y: CENTER4 };
      const marks = [pt(origin.x, origin.y, f.r(1.4, 2.2), 1.25)];
      const rays = f.int(4, 6);
      for (let i = 0; i < rays; i += 1) {
        const t = rays === 1 ? 0.5 : i / (rays - 1);
        const a = -0.7 + t * 1.4;
        const len = f.r(8.2, 11.4);
        const x = origin.x + Math.cos(a) * len;
        const y = origin.y + Math.sin(a) * len;
        marks.push(ln2(origin.x, origin.y, x, y, f.r(0.16, 0.3), 0.85));
        marks.push(pt(x, y, f.r(0.7, 1.4), 0.8));
      }
      return marks;
    }
    if (kind === "arcade") {
      const path2 = along3(5, 7, CENTER4 + 2.2, f, 0.1);
      const marks = compose2(
        path2,
        path2.map((_, i) => ({ at: i, side: -1, stem: f.r(1.6, 2.2), radius: f.r(0.85, 1.25) })),
        f.r(0.28, 0.42),
        "line"
      );
      for (let i = 0; i < path2.length - 1; i += 1) {
        const a = path2[i];
        const b = path2[i + 1];
        marks.push(cv2(a.x, a.y - 0.2, b.x, b.y - 0.2, (a.x + b.x) / 2, a.y - f.r(2.2, 3.4), f.r(0.22, 0.36), 0.55));
      }
      return marks;
    }
    if (kind === "loop") {
      const x0 = CENTER4 - 6.2;
      const x1 = CENTER4 + 6.2;
      const y0 = CENTER4 - 3;
      const y1 = CENTER4 + 3;
      const marks = [
        ln2(x0, y0, x1, y0, f.r(0.22, 0.38), 1.2),
        ln2(x1, y0, x1, y1, f.r(0.22, 0.38), 1.2),
        ln2(x1, y1, x0, y1, f.r(0.22, 0.38), 1.2),
        ln2(x0, y1, x0, y0, f.r(0.22, 0.38), 1.2),
        pt(x0, y0, f.r(0.9, 1.5), 0.85),
        pt(x1, y1, f.r(1.1, 1.8), 0.9),
        pt((x0 + x1) / 2, y0, f.r(0.8, 1.3), 0.75)
      ];
      const side = f.chance(0.5) ? 1 : -1;
      marks.push(ln2((x0 + x1) / 2, side > 0 ? y1 : y0, (x0 + x1) / 2, CENTER4 + side * 5.2, 0.24, 0.7));
      marks.push(pt((x0 + x1) / 2, CENTER4 + side * 5.2, f.r(1.3, 2.1), 0.95));
      return marks;
    }
    if (kind === "broken") {
      const marks = [];
      const chunks = [
        { x0: CENTER4 - 7.4, x1: CENTER4 - 3.2, y: CENTER4 + f.r(-2.8, -0.8) },
        { x0: CENTER4 - 1.6, x1: CENTER4 + 1.8, y: CENTER4 + f.r(-0.6, 0.6) },
        { x0: CENTER4 + 3.4, x1: CENTER4 + 7.4, y: CENTER4 + f.r(0.8, 2.8) }
      ];
      for (let i = 0; i < chunks.length; i += 1) {
        const c = chunks[i];
        marks.push(ln2(c.x0, c.y, c.x1, c.y, f.r(0.28, 0.5), 1.25));
        marks.push(pt(c.x0, c.y, f.r(1, 1.7), 0.9));
        marks.push(pt(c.x1, c.y, f.r(1, 1.7), 0.9));
        if (i > 0) {
          const prev = chunks[i - 1];
          marks.push(ln2(prev.x1, prev.y, c.x0, c.y, f.r(0.1, 0.2), 0.55));
        }
      }
      return marks;
    }
    return wrapAroundCenter(f);
  }
  var GALLERY_POSES = [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 5, -Math.PI / 5];
  var GALLERY_SCALES = [0.82, 0.96, 1.1, 0.74, 1.16, 0.9];
  function planLinearGallery(seed, attempt = 0, index2 = 0) {
    const rng = mulberry32(seed ^ 4500625 ^ attempt * 668265261 ^ index2 * 2654435769);
    const f = frame4(rng);
    const cycle = Math.floor(index2 / GALLERY_FAMILIES.length);
    const kind = GALLERY_FAMILIES[index2 % GALLERY_FAMILIES.length];
    const growth = GROWTH_MODES2[(cycle + attempt * 3) % GROWTH_MODES2.length];
    return {
      kind,
      growth,
      index: index2,
      scale: GALLERY_SCALES[cycle % GALLERY_SCALES.length] * f.r(0.96, 1.04),
      originX: CENTER4,
      originY: CENTER4,
      twist: GALLERY_POSES[(cycle + attempt) % GALLERY_POSES.length] + f.r(-0.04, 0.04),
      flip: (cycle + attempt & 1) === 1
    };
  }
  function attractorsFromLinearGallery(plan, seed, attempt = 0) {
    const rng = mulberry32(seed ^ 18817773 ^ attempt * 2246822507 ^ plan.index * 374761393);
    const f = frame4(rng);
    let marks = familyMarks(plan.kind, f);
    if (plan.kind !== "wrap" && (plan.kind === "meander" || plan.kind === "arcade") && f.chance(0.45)) {
      marks = addWraps(marks, f);
    }
    if ((plan.growth === "mass" || plan.growth === "bloom" || plan.growth === "heavy") && f.chance(0.7) && plan.kind !== "wrap") {
      marks = carveOrganicVoid(marks, f);
    }
    return place2(marks, plan).map((mark) => ({
      ...mark,
      hole: false,
      kind: mark.kind === "ring" ? "point" : mark.kind
    }));
  }
  function slimeFromLinearGallery(base2, plan, seed) {
    const rng = mulberry32(seed ^ 5357790 ^ plan.index ^ plan.growth.length);
    const f = frame4(rng);
    const byGrowth = {
      filament: {
        persistence: f.r(0.72, 0.92),
        trailInfluence: f.r(1.1, 1.85),
        deposit: f.r(0.01, 0.045),
        depositWidth: f.r(0.22, 0.55),
        diffusion: f.r(0, 0.02),
        randomness: f.r(0.04, 0.22),
        trailCap: f.r(0.28, 0.7),
        sensorAngle: f.r(0.08, 0.28)
      },
      mass: {
        persistence: f.r(0.5, 0.78),
        trailInfluence: f.r(0.7, 1.4),
        deposit: f.r(0.12, 0.26),
        depositWidth: f.r(1.6, 3.1),
        diffusion: f.r(0.02, 0.08),
        randomness: f.r(0.06, 0.28),
        trailCap: f.r(1.1, 1.85),
        sensorAngle: f.r(0.16, 0.42)
      },
      sparse: {
        persistence: f.r(0.28, 0.55),
        trailInfluence: f.r(0.35, 0.85),
        deposit: f.r(0.015, 0.06),
        depositWidth: f.r(0.28, 0.8),
        diffusion: f.r(0, 0.03),
        randomness: f.r(0.35, 0.85),
        trailCap: f.r(0.3, 0.85),
        sensorAngle: f.r(0.28, 0.7)
      },
      bloom: {
        persistence: f.r(0.4, 0.68),
        trailInfluence: f.r(0.55, 1.2),
        deposit: f.r(0.06, 0.16),
        depositWidth: f.r(1.2, 2.4),
        diffusion: f.r(0.06, 0.14),
        randomness: f.r(0.12, 0.4),
        trailCap: f.r(0.8, 1.5),
        sensorAngle: f.r(0.22, 0.55)
      },
      sharp: {
        persistence: f.r(0.62, 0.88),
        trailInfluence: f.r(0.9, 1.7),
        deposit: f.r(0.02, 0.07),
        depositWidth: f.r(0.22, 0.48),
        diffusion: f.r(0, 0.015),
        randomness: f.r(0.03, 0.18),
        trailCap: f.r(0.35, 0.9),
        sensorAngle: f.r(0.08, 0.26)
      },
      heavy: {
        persistence: f.r(0.55, 0.84),
        trailInfluence: f.r(0.8, 1.6),
        deposit: f.r(0.1, 0.24),
        depositWidth: f.r(1.8, 3.2),
        diffusion: f.r(0.01, 0.06),
        randomness: f.r(0.05, 0.24),
        trailCap: f.r(1.3, 1.95),
        sensorAngle: f.r(0.12, 0.36)
      },
      wander: {
        persistence: f.r(0.22, 0.48),
        trailInfluence: f.r(0.28, 0.75),
        deposit: f.r(0.03, 0.1),
        depositWidth: f.r(0.4, 1.2),
        diffusion: f.r(0.02, 0.08),
        randomness: f.r(0.45, 0.95),
        trailCap: f.r(0.4, 1.1),
        sensorAngle: f.r(0.35, 0.85)
      },
      committed: {
        persistence: f.r(0.7, 0.92),
        trailInfluence: f.r(1.2, 1.9),
        deposit: f.r(0.04, 0.12),
        depositWidth: f.r(0.35, 1),
        diffusion: f.r(0, 0.03),
        randomness: f.r(0.02, 0.16),
        trailCap: f.r(0.5, 1.2),
        sensorAngle: f.r(0.08, 0.24)
      }
    };
    const carved = plan.kind === "loop" || plan.kind === "islands" || plan.growth === "mass" || plan.growth === "bloom" || plan.growth === "heavy";
    return {
      ...base2,
      stepSize: f.r(0.1, 0.36),
      sensorDistance: f.r(0.35, 1.7),
      turnAngle: f.r(0.06, 0.7),
      decay: f.r(0.94, 0.994),
      resistance: f.r(0.02, 0.4),
      voidElongation: carved ? f.r(0.55, 1.85) : 1,
      voidRotation: carved ? f.r(0, Math.PI) : 0,
      voidLobes: 0,
      voidNotch: 0,
      foodPoints: [],
      ...byGrowth[plan.growth],
      trailInfluence: f.r(0.2, 0.38),
      randomness: f.r(0.16, 0.3),
      persistence: f.r(0.28, 0.46),
      decay: 0.998,
      diffusion: 0,
      voidElongation: 1,
      voidRotation: 0,
      voidLobes: 0,
      voidNotch: 0
    };
  }
  function paramsFromLinearGallery(base2, seed) {
    const rng = mulberry32(seed ^ 1178146);
    return {
      ...base2,
      attractionStrength: 0.32 + rng() * 0.55,
      networkDensity: 0.22 + rng() * 0.62,
      permeability: 0.28 + rng() * 0.55,
      flowCoupling: 0.28 + rng() * 0.55,
      directionalBias: 0.4 + rng() * 0.5,
      geometryVariation: 0.3 + rng() * 0.58
    };
  }
  function recipeFromLinearGallery(recipe, seed) {
    const rng = mulberry32(seed ^ 1174562);
    const f = frame4(rng);
    return {
      ...recipe,
      clustering: f.r(0.12, 0.72),
      isolationRadius: f.r(2, 5.2),
      approachWidth: f.r(1.1, 3.6),
      coreExposure: f.r(0.28, 0.82)
    };
  }
  function agentsFromLinearGallery(plan, seed) {
    const rng = mulberry32(seed ^ 1155630 ^ plan.index);
    const byGrowth = {
      filament: [160, 200],
      mass: [190, 240],
      sparse: [150, 190],
      bloom: [170, 220],
      sharp: [160, 200],
      heavy: [190, 240],
      wander: [150, 200],
      committed: [170, 220]
    };
    const [min, max] = byGrowth[plan.growth];
    return Math.round(min + rng() * (max - min));
  }

  // lib/skill1/run-void-field.ts
  var LO2 = 0.6;
  var HI2 = FIELD_SIZE - 0.6;
  var VF_MODES = [
    "round",
    "round-large",
    "round-small",
    "offset",
    "edge",
    "corner",
    "elongated",
    "cut",
    "organic",
    "lobed",
    "split",
    "several",
    "anchors",
    "isolated",
    "aside",
    "toward",
    "approaches",
    "off-center",
    "partial",
    "around"
  ];
  var clamp4 = (value, min, max) => Math.min(max, Math.max(min, value));
  var span3 = (rng, min, max) => min + rng() * (max - min);
  var CIRCLE = { elong: 1, lobes: 0, notch: 0 };
  var CORNERS = ["bottom-left", "bottom-right"];
  function planVoidField(seed, _attempt = 0, index2 = 0) {
    const cell = (index2 % 100 + 100) % 100;
    const mode = VF_MODES[cell % VF_MODES.length];
    const cycle = Math.floor(cell / VF_MODES.length);
    const rng = mulberry32((seed ^ 1612575213 ^ (cell + 1) * 2654435761) >>> 0);
    const built = build2(mode, rng);
    return {
      index: cell,
      cycle,
      mode,
      sourceCorner: CORNERS[(cell + seed) % CORNERS.length],
      ...built
    };
  }
  function build2(mode, rng) {
    const openAngle = span3(rng, 0, Math.PI * 2);
    if (mode === "round") {
      return pack(rng, openAngle, "open", {
        voids: [disk(rng, 7.5, 12.5, 7.5, 12.5, 2.2, 3.2)],
        ...CIRCLE,
        relate: "cloud",
        pad: 0.9,
        pointTarget: 40
      });
    }
    if (mode === "round-large") {
      return pack(rng, openAngle, "open", {
        voids: [disk(rng, 8, 12, 8, 12, 3.4, 4.4)],
        ...CIRCLE,
        relate: "cloud",
        pad: 0.85,
        pointTarget: 42
      });
    }
    if (mode === "round-small") {
      return pack(rng, openAngle, "vein", {
        voids: [disk(rng, 4, 16, 4, 16, 1.6, 2.4)],
        ...CIRCLE,
        relate: "large",
        pad: 1,
        pointTarget: 44
      });
    }
    if (mode === "offset") {
      const left = rng() < 0.5;
      return pack(rng, openAngle, "braid", {
        voids: [disk(rng, left ? 3.2 : 13, left ? 6.5 : 16.5, 5, 15, 2.6, 4)],
        ...CIRCLE,
        relate: "large",
        pad: 0.35,
        pointTarget: 30
      });
    }
    if (mode === "edge") {
      const at2 = edgePoint(rng, span3(rng, 2.2, 3.4));
      return pack(rng, openAngle, "open", {
        voids: [{ ...at2, r: span3(rng, 2.2, 3.2) }],
        ...CIRCLE,
        relate: "large",
        pad: 0.85,
        pointTarget: 40
      });
    }
    if (mode === "corner") {
      const at2 = cornerPoint(rng, span3(rng, 2.6, 4.2));
      return pack(rng, openAngle, "vein", {
        voids: [{ ...at2, r: span3(rng, 2.2, 3.4) }],
        ...CIRCLE,
        relate: "apart",
        pad: 0.3,
        pointTarget: 24
      });
    }
    if (mode === "elongated") {
      return pack(rng, openAngle, "braid", {
        voids: [disk(rng, 6, 14, 6, 14, 2.4, 3.4)],
        elong: span3(rng, 2.05, 2.6),
        lobes: 0,
        notch: 0,
        relate: "cloud",
        pad: 0.3,
        pointTarget: 28
      });
    }
    if (mode === "cut") {
      return pack(rng, openAngle, "open", {
        voids: [disk(rng, 8, 12, 8, 12, 4.2, 5.6)],
        elong: span3(rng, 0.34, 0.46),
        lobes: 0,
        notch: 0,
        relate: "large",
        pad: 0.25,
        pointTarget: 30
      });
    }
    if (mode === "organic") {
      return pack(rng, openAngle, "mesh", {
        voids: [disk(rng, 6.5, 13.5, 6.5, 13.5, 3, 4.4)],
        elong: span3(rng, 1.05, 1.45),
        lobes: span3(rng, 0.42, 0.7),
        notch: span3(rng, 0.08, 0.28),
        relate: "cloud",
        pad: 0.3,
        pointTarget: 26
      });
    }
    if (mode === "lobed") {
      return pack(rng, openAngle, "mesh", {
        voids: [disk(rng, 7, 13, 7, 13, 3.2, 4.6)],
        elong: span3(rng, 0.9, 1.15),
        lobes: span3(rng, 0.58, 0.82),
        notch: 0,
        relate: "cloud",
        pad: 0.3,
        pointTarget: 26
      });
    }
    if (mode === "split") {
      return pack(rng, openAngle, "open", {
        voids: apart(rng, 2, 2.2, 3.4, 2.4),
        ...CIRCLE,
        relate: "large",
        pad: 0.3,
        pointTarget: 28
      });
    }
    if (mode === "several") {
      return pack(rng, openAngle, "vein", {
        voids: apart(rng, 3, 1.7, 2.6, 2.6),
        ...CIRCLE,
        relate: "large",
        pad: 0.35,
        pointTarget: 26
      });
    }
    if (mode === "anchors") {
      const main = disk(rng, 6, 14, 6, 14, 2.8, 4);
      const extras = [];
      let guard = 0;
      while (extras.length < 2 && guard < 40) {
        guard += 1;
        const ang = span3(rng, 0, Math.PI * 2);
        const dist2 = main.r + span3(rng, 3.8, 6.5);
        const hole2 = {
          x: clamp4(main.x + Math.cos(ang) * dist2, 1.8, 18.2),
          y: clamp4(main.y + Math.sin(ang) * dist2, 1.8, 18.2),
          r: span3(rng, 1.15, 1.75)
        };
        if (Math.hypot(hole2.x - main.x, hole2.y - main.y) < main.r + hole2.r + 2) continue;
        if (extras.some((other) => Math.hypot(other.x - hole2.x, other.y - hole2.y) < other.r + hole2.r + 1.6)) continue;
        extras.push(hole2);
      }
      return pack(rng, openAngle, "braid", {
        voids: [main, ...extras],
        ...CIRCLE,
        relate: "large",
        pad: 0.35,
        pointTarget: 28
      });
    }
    if (mode === "isolated") {
      const at2 = edgePoint(rng, span3(rng, 2.2, 3.2));
      return pack(rng, 0, "vein", {
        voids: [{ ...at2, r: span3(rng, 1.7, 2.6) }],
        ...CIRCLE,
        relate: "apart",
        pad: 0.3,
        pointTarget: 30
      });
    }
    if (mode === "aside") {
      const hole2 = disk(rng, 5, 15, 5, 15, 2.4, 3.6);
      return pack(rng, roomiest(hole2.x, hole2.y, rng), "open", {
        voids: [hole2],
        ...CIRCLE,
        relate: "side",
        gap: span3(rng, 1.35, 1.7),
        pad: 0.35,
        pointTarget: 26
      });
    }
    if (mode === "toward") {
      const hole2 = disk(rng, 6, 14, 6, 14, 2.2, 3.4);
      return pack(rng, roomiest(hole2.x, hole2.y, rng), "vein", {
        voids: [hole2],
        ...CIRCLE,
        relate: "side",
        gap: span3(rng, 0.85, 1.15),
        pad: 0.3,
        pointTarget: 22
      });
    }
    if (mode === "approaches") {
      return pack(rng, openAngle, "braid", {
        voids: [disk(rng, 7.5, 12.5, 7.5, 12.5, 2.4, 3.6)],
        ...CIRCLE,
        relate: "arms",
        armCount: 3,
        pad: 0.3,
        pointTarget: 28
      });
    }
    if (mode === "off-center") {
      return pack(rng, openAngle, "open", {
        voids: [disk(rng, 2.8, 6.2, 3, 17, 1.8, 2.8)],
        ...CIRCLE,
        relate: "large",
        pad: 0.35,
        pointTarget: 32
      });
    }
    if (mode === "partial") {
      const at2 = edgePoint(rng, span3(rng, 1.3, 2.2));
      const inward = Math.atan2(FIELD_SIZE * 0.5 - at2.y, FIELD_SIZE * 0.5 - at2.x);
      return pack(rng, inward, "open", {
        voids: [{ ...at2, r: span3(rng, 3.2, 4.6) }],
        ...CIRCLE,
        relate: "side",
        gap: 1.05,
        pad: 0.25,
        pointTarget: 24
      });
    }
    return pack(rng, openAngle, "vein", {
      voids: [disk(rng, 7, 13, 7, 13, 2.2, 3.2)],
      elong: span3(rng, 1.1, 1.5),
      lobes: span3(rng, 0.12, 0.28),
      notch: 0,
      relate: "arms",
      armCount: 2,
      pad: 0.35,
      pointTarget: 24
    });
  }
  function roomiest(x, y, rng) {
    let best = 0;
    let bestA = 0;
    for (let i = 0; i < 16; i += 1) {
      const angle = i / 16 * Math.PI * 2 + rng() * 0.15;
      const room = toEdge(x, y, angle);
      if (room > best) {
        best = room;
        bestA = angle;
      }
    }
    return bestA;
  }
  function edgePoint(rng, inset) {
    const along4 = span3(rng, 5, 15);
    const side = Math.floor(rng() * 4);
    if (side === 0) return { x: inset, y: along4 };
    if (side === 1) return { x: FIELD_SIZE - inset, y: along4 };
    if (side === 2) return { x: along4, y: inset };
    return { x: along4, y: FIELD_SIZE - inset };
  }
  function cornerPoint(rng, inset) {
    const corner = Math.floor(rng() * 4);
    if (corner === 0) return { x: inset, y: inset };
    if (corner === 1) return { x: FIELD_SIZE - inset, y: inset };
    if (corner === 2) return { x: inset, y: FIELD_SIZE - inset };
    return { x: FIELD_SIZE - inset, y: FIELD_SIZE - inset };
  }
  function disk(rng, x0, x1, y0, y1, r0, r1) {
    return { x: span3(rng, x0, x1), y: span3(rng, y0, y1), r: span3(rng, r0, r1) };
  }
  function apart(rng, count, r0, r1, gap) {
    const voids = [];
    let guard = 0;
    while (voids.length < count && guard < 80) {
      guard += 1;
      const next = disk(rng, 2.5, 17.5, 2.5, 17.5, r0, r1);
      if (voids.every((hole2) => Math.hypot(hole2.x - next.x, hole2.y - next.y) > hole2.r + next.r + gap)) voids.push(next);
    }
    return voids.length ? voids : [disk(rng, 8, 12, 8, 12, r0, r1)];
  }
  function pack(rng, openAngle, growth, spec2) {
    const core = spec2.voids[0];
    const rot = span3(rng, 0, Math.PI);
    let fieldX = span3(rng, 8.6, 11.4);
    let fieldY = span3(rng, 8.6, 11.4);
    let fieldR = spec2.fieldR ?? span3(rng, 8.2, 9.3);
    const arms = [];
    if (core && spec2.relate === "apart") {
      openAngle = roomiest(core.x, core.y, rng);
      fieldR = span3(rng, 4.4, 6.2);
      const dist2 = core.r + fieldR + span3(rng, 1.8, 3.1);
      fieldX = clamp4(core.x + Math.cos(openAngle) * dist2, 4.2, 15.8);
      fieldY = clamp4(core.y + Math.sin(openAngle) * dist2, 4.2, 15.8);
      const centerDist = Math.hypot(fieldX - core.x, fieldY - core.y);
      fieldR = Math.min(fieldR, Math.max(3.6, centerDist - core.r - 1.4));
    } else if (core && spec2.relate === "side") {
      openAngle = roomiest(core.x, core.y, rng);
      fieldR = span3(rng, 3.8, 5.4);
      const dist2 = core.r + fieldR * 0.62 + span3(rng, 1.05, 1.7);
      fieldX = clamp4(core.x + Math.cos(openAngle) * dist2, 3.8, 16.2);
      fieldY = clamp4(core.y + Math.sin(openAngle) * dist2, 3.8, 16.2);
    } else if (core && spec2.relate === "large") {
      fieldX = span3(rng, 8.8, 11.2);
      fieldY = span3(rng, 8.8, 11.2);
      fieldR = spec2.fieldR ?? span3(rng, 8.6, 9.5);
    } else if (spec2.relate === "cloud") {
      fieldR = spec2.fieldR ?? span3(rng, 7.6, 9);
    } else if (spec2.relate === "arms") {
      fieldR = span3(rng, 2.7, 3.8);
      const count = spec2.armCount ?? 3;
      let cursor = openAngle + span3(rng, 0, 0.4);
      for (let i = 0; i < count; i += 1) {
        arms.push(cursor);
        cursor += span3(rng, 1.7, 2.35);
      }
    }
    return {
      growth,
      voids: spec2.voids,
      elong: spec2.elong,
      lobes: spec2.lobes,
      notch: spec2.notch,
      rot,
      openAngle,
      gap: spec2.gap ?? 0.55,
      pad: Math.max(spec2.pad, spec2.relate === "side" || spec2.relate === "arms" ? 0.75 : 0.95),
      pointTarget: spec2.pointTarget + (spec2.relate === "cloud" || spec2.relate === "large" ? 12 : 0) + Math.floor(rng() * 5),
      relate: spec2.relate,
      fieldX,
      fieldY,
      fieldR,
      arms
    };
  }
  function shapeOf2(plan) {
    return {
      voidElongation: plan.elong,
      voidRotation: plan.rot,
      voidLobes: plan.lobes,
      voidNotch: plan.notch
    };
  }
  function insideVoid(plan, x, y) {
    const shape = shapeOf2(plan);
    for (const hole2 of plan.voids) {
      const angle = Math.atan2(y - hole2.y, x - hole2.x);
      const limit = voidRadius(angle, hole2.r, shape);
      if (Math.hypot(x - hole2.x, y - hole2.y) < limit + plan.pad) return true;
    }
    return false;
  }
  function toEdge(x, y, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    let t = 28;
    if (c > 0.02) t = Math.min(t, (HI2 - x) / c);
    if (c < -0.02) t = Math.min(t, (LO2 - x) / c);
    if (s > 0.02) t = Math.min(t, (HI2 - y) / s);
    if (s < -0.02) t = Math.min(t, (LO2 - y) / s);
    return Math.max(0.4, t);
  }
  function sampleOccupied(plan, rng) {
    const core = plan.voids[0];
    if (core && plan.relate === "arms") {
      const arms = plan.arms.length ? plan.arms : [plan.openAngle];
      const ang = arms[Math.floor(rng() * arms.length)] ?? plan.openAngle;
      const reach = core.r + plan.fieldR * 0.7 + 1.15;
      return blob(
        core.x + Math.cos(ang) * reach,
        core.y + Math.sin(ang) * reach,
        plan.fieldR,
        plan.rot + ang,
        rng
      );
    }
    return blob(plan.fieldX, plan.fieldY, plan.fieldR, plan.rot, rng);
  }
  function blob(cx, cy, radius, rot, rng) {
    const ang = rng() * Math.PI * 2;
    const lump = 0.74 + 0.2 * Math.cos(ang * 3 + rot) + 0.12 * Math.cos(ang * 5 - rot);
    const dist2 = Math.sqrt(rng()) * radius * lump;
    return { x: cx + Math.cos(ang) * dist2, y: cy + Math.sin(ang) * dist2 };
  }
  function fieldPoints2(plan, rng) {
    const points = [];
    const spacing = plan.relate === "arms" || plan.relate === "side" ? 1.45 : 1.55;
    let guard = 0;
    while (points.length < plan.pointTarget && guard < plan.pointTarget * 90) {
      guard += 1;
      const sample2 = sampleOccupied(plan, rng);
      if (sample2.x < 1.2 || sample2.y < 1.2 || sample2.x > FIELD_SIZE - 1.2 || sample2.y > FIELD_SIZE - 1.2) continue;
      if (insideVoid(plan, sample2.x, sample2.y)) continue;
      if (points.some((point) => Math.hypot(point.x - sample2.x, point.y - sample2.y) < spacing)) continue;
      points.push(sample2);
    }
    return points;
  }
  function attractorsFromVoidField(plan) {
    const rng = mulberry32((1374547981 ^ (plan.index + 1) * 2246822507) >>> 0);
    const voids = plan.voids.map((hole2) => ({
      kind: "ring",
      x: hole2.x,
      y: hole2.y,
      radius: hole2.r,
      strength: 0.02,
      hole: true
    }));
    const points = fieldPoints2(plan, rng).map((point) => ({
      kind: "point",
      x: point.x,
      y: point.y,
      radius: 1.05,
      strength: 0.28 + rng() * 0.22
    }));
    return [...voids, ...points];
  }

  // lib/skill1/run-open-hall.ts
  var CENTER5 = (FIELD_SIZE - 1) / 2;
  var EDGE6 = 1.35;
  var lim6 = (value) => Math.min(FIELD_SIZE - EDGE6, Math.max(EDGE6, value));
  function frame5(rng) {
    return {
      r: (min, max) => min + rng() * (max - min),
      int: (min, max) => Math.floor(min + rng() * (max - min + 1)),
      chance: (p) => rng() < p,
      pick: (items) => items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
    };
  }
  var OPEN_HALL_FAMILIES = [
    "equal-grid",
    "wide-bays",
    "tall-bays",
    "offset-rows",
    "side-aisle",
    "double-aisle",
    "corner-clusters",
    "open-frame",
    "staggered",
    "spine",
    "court",
    "loose",
    "pinwheel",
    "merged",
    "lanes",
    "end-band",
    "raft",
    "ribbons",
    "nested",
    "comb"
  ];
  var OPEN_HALL_GROWTHS = ["filament", "sparse", "sharp", "wander", "committed"];
  var MIRRORS = /* @__PURE__ */ new Set([
    "side-aisle",
    "comb",
    "staggered",
    "ribbons",
    "end-band",
    "spine",
    "loose",
    "open-frame"
  ]);
  function seg2(u, v, u2, v2, radius, strength) {
    return { u, v, u2, v2, radius, strength };
  }
  function box(u, v, w, h, width, strength) {
    return [
      seg2(u - w, v - h, u + w, v - h, width, strength),
      seg2(u - w, v + h, u + w, v + h, width, strength),
      seg2(u - w, v - h, u - w, v + h, width, strength),
      seg2(u + w, v - h, u + w, v + h, width, strength)
    ];
  }
  function plus(u, v, w, h, width, strength) {
    return [seg2(u - w, v, u + w, v, width, strength), seg2(u, v - h, u, v + h, width, strength)];
  }
  function poly(pts, width, strength) {
    const marks = [];
    for (let i = 0; i < pts.length - 1; i += 1) {
      marks.push(seg2(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], width, strength));
    }
    return marks;
  }
  function planOpenHall(seed, attempt = 0, index2 = 0) {
    const rng = mulberry32(seed ^ 14752273 ^ attempt * 668265261 ^ index2 * 2654435769);
    const f = frame5(rng);
    const cycle = Math.floor(index2 / OPEN_HALL_FAMILIES.length);
    const kind = OPEN_HALL_FAMILIES[index2 % OPEN_HALL_FAMILIES.length];
    const growth = OPEN_HALL_GROWTHS[(cycle + attempt) % OPEN_HALL_GROWTHS.length];
    return {
      kind,
      growth,
      index: index2,
      cycle,
      cols: 2 + (index2 + cycle * 2) % 4,
      rows: 2 + (index2 * 3 + cycle) % 4,
      pitchU: 2.4 + (index2 * 5 + cycle) % 8 * 0.42,
      pitchV: 2.2 + (index2 * 7 + cycle * 3) % 8 * 0.4,
      turn: 0,
      flip: MIRRORS.has(kind) && cycle === 4,
      driftX: f.r(-0.55, 0.55),
      driftY: f.r(-0.55, 0.55),
      gap: 0.7 + cycle % 5 * 0.28
    };
  }
  function equalGrid(cycle, width) {
    if (cycle === 0) return [...box(-2.2, 2.2, 1.5, 1.5, width, 0.55), ...box(2.2, 2.2, 1.5, 1.5, width, 0.55), ...box(-2.2, -2.2, 1.5, 1.5, width, 0.55), ...box(2.2, -2.2, 1.5, 1.5, width, 0.55)];
    if (cycle === 1) return [...box(-3.6, 0, 2.4, 1.1, width, 0.55), ...box(0, 0, 1.1, 2.4, width, 0.5), ...box(3.6, 0, 1.6, 1.6, width, 0.48)];
    if (cycle === 2) return [seg2(-6, -3, 6, -3, width, 0.58), seg2(-6, 0, 6, 0, width, 0.58), seg2(-6, 3, 6, 3, width, 0.58), seg2(-3, -5, -3, 5, width, 0.5), seg2(3, -5, 3, 5, width, 0.5)];
    if (cycle === 3) return [...box(-4.2, 1.6, 1.2, 0.8, width, 0.5), ...box(0, 1.6, 1.8, 1.4, width, 0.55), ...box(4.2, 1.6, 0.7, 1.1, width, 0.46), ...box(-2.2, -2.4, 2.2, 0.7, width, 0.5), ...box(2.8, -2.4, 1, 1.3, width, 0.48)];
    return [seg2(-6.4, -2.2, 6.4, -2.2, width, 0.56), seg2(-6.4, 2.2, 6.4, 2.2, width, 0.56), seg2(-4.2, -4.4, -4.2, 4.4, width, 0.5), seg2(0, -4.4, 0, 4.4, width, 0.5), seg2(4.2, -4.4, 4.2, 4.4, width, 0.5)];
  }
  function wideHalls(cycle, width) {
    if (cycle === 0) return [seg2(-7.6, 0, 7.6, 0, width, 0.7), seg2(-5.2, 0, -5.2, 1.8, width, 0.46), seg2(5.2, 0, 5.2, 1.8, width, 0.46)];
    if (cycle === 1) return [seg2(-7.6, 0, -1.4, 0, width, 0.66), seg2(1.8, 0, 7.6, 0, width, 0.66)];
    if (cycle === 2) return [seg2(-7.4, -0.6, 7.4, -0.6, width, 0.62), seg2(-7.4, 1.8, 3.2, 1.8, width, 0.48)];
    if (cycle === 3) return [...box(-6.2, 0, 1.2, 1.5, width, 0.55), seg2(-4.6, 0, 4.4, 0, width, 0.6), ...box(6.2, 0, 0.7, 2.4, width, 0.48)];
    return [seg2(-7.5, 0, 7.5, 0, width, 0.68), ...plus(-6.4, 0, 0.6, 1.2, width, 0.4), ...plus(6.6, 0, 1.1, 0.5, width, 0.42)];
  }
  function tallHalls(cycle, width) {
    if (cycle === 0) return [seg2(0, -7.2, 0, 7.2, width, 0.7), seg2(-1.8, 6.4, 1.8, 6.4, width, 0.5)];
    if (cycle === 1) return [seg2(-0.9, -6.6, -0.9, 6.6, width, 0.58), seg2(0.9, -6.6, 0.9, 6.6, width, 0.58)];
    if (cycle === 2) return [seg2(0, -7, 0, -1.2, width, 0.64), seg2(0, 1.6, 0, 7, width, 0.64)];
    if (cycle === 3) return box(0, 0, 1.15, 6.4, width, 0.56);
    return [seg2(0, -6.8, 0, 6.8, width, 0.66), ...box(0, -5.6, 1.6, 0.7, width, 0.46), ...plus(0, 5.8, 0.5, 0.9, width, 0.42)];
  }
  function offsetRows(cycle, width) {
    const dashes = [
      [[-6.8, -4.2, -3], [-1.2, 1.4, -3], [3.2, 6.6, -3], [-5.4, -2.2, 0.4], [0.6, 4.8, 0.4], [-6.2, -3.6, 3.4], [-0.4, 2.2, 3.4], [4.4, 6.8, 3.4]],
      [[-7, -5.6, -2.2], [-2.4, 0.2, -2.2], [3.4, 5.2, 1.6], [-6.4, -4.8, 4.2], [1.2, 2.4, 4.2]],
      [[-6.6, -1.2, -4.2], [1.4, 6.8, -4.2], [-7.2, -4.4, 0], [-1.6, 0.8, 0], [3.6, 7, 0], [-5.2, -2.8, 4.4], [0.4, 3.2, 4.4]],
      [[-7.2, -6, -1], [-3.2, -2.2, -1], [1.4, 2.2, 2.4], [4.6, 5.4, 2.4], [-4.4, -3.2, 5], [2.8, 4.2, -4.6]],
      [[-6.4, -2.2, -3.6], [0.8, 6.6, -3.6], [-7, -5.2, 1.2], [-2.6, -1.2, 1.2], [2.4, 4.2, 1.2], [-4.8, 1.6, 4.8]]
    ][cycle];
    return dashes.map(([u0, u1, v], index2) => seg2(u0, v, u1, v, width * (index2 % 2 === 0 ? 1 : 0.8), 0.44));
  }
  function sideAisle(cycle, width) {
    if (cycle === 0) return poly([[-6.4, -1.2], [5.6, -1.2], [5.6, 5.4]], width, 0.62);
    if (cycle === 1) return poly([[-1.4, -6.2], [-1.4, 4.8], [5.8, 4.8]], width, 0.62);
    if (cycle === 2) return [seg2(-6.2, -1, 1.2, -1, width, 0.58), seg2(3.4, -1, 6.2, -1, width, 0.5), seg2(6.2, -1, 6.2, 5.2, width, 0.55)];
    if (cycle === 3) return [...box(-4.2, -2.2, 1.6, 0.8, width, 0.52), ...box(-1.2, -2.2, 0.9, 0.8, width, 0.48), ...box(2.4, -2.2, 1.3, 0.8, width, 0.5), ...box(4.6, 0.6, 0.8, 1.4, width, 0.48), ...box(4.6, 3.6, 0.8, 0.7, width, 0.44)];
    return [...poly([[-5.4, -3.2], [2.2, -3.2], [2.2, 1.4]], width, 0.58), ...poly([[-1.2, 2.4], [-1.2, 5.6], [5.4, 5.6]], width * 0.9, 0.46)];
  }
  function doubleAisle(cycle, width) {
    if (cycle === 0) return [seg2(-4.2, -5.2, -4.2, 5.2, width, 0.58), seg2(4.2, -5.2, 4.2, 5.2, width, 0.58), seg2(-4.2, 0, 4.2, 0, width, 0.62)];
    if (cycle === 1) return [seg2(-4.6, -5.4, -4.6, 5.4, width, 0.56), seg2(4.6, -5.4, 4.6, 5.4, width, 0.56), seg2(-4.6, 3.6, 4.6, 3.6, width, 0.6)];
    if (cycle === 2) return [seg2(-4.4, -5, -4.4, 5, width, 0.6), seg2(-4.4, 0.4, 3.2, 0.4, width, 0.52)];
    if (cycle === 3) return [seg2(-3.6, -6.2, -3.6, 2.2, width, 0.56), seg2(4.4, -2.4, 4.4, 6.2, width, 0.56), seg2(-3.6, 0, 4.4, 0, width, 0.6)];
    return [seg2(-4.8, -4.8, -4.8, 4.8, width, 0.55), seg2(4.8, -4.8, 4.8, 4.8, width, 0.55), ...box(0, 0.2, 1.6, 0.7, width, 0.46)];
  }
  function cornerClusters(cycle, width) {
    const big = [
      [0, 2.4, 1.8],
      [1, 2.6, 1.5],
      [2, 2.2, 2],
      [3, 2.8, 1.4],
      [0, 1.2, 2.6]
    ][cycle];
    const spots = [[-5.4, 4.4], [5.6, 4.2], [-5.6, -4.4], [5.4, -4.6]];
    return spots.flatMap(([u, v], i) => {
      const huge = i === big[0];
      const w = huge ? big[1] : 0.55 + i % 2 * 0.25;
      const h = huge ? big[2] : 0.45 + (i + 1) % 2 * 0.3;
      return cycle === 3 ? plus(u, v, w, h, width, 0.52) : box(u, v, w, h, width, huge ? 0.62 : 0.44);
    });
  }
  function openFrame(cycle, width) {
    if (cycle === 0) return [seg2(-5.4, -3.6, -5.4, 3.8, width, 0.58), seg2(-5.4, -3.6, 5.4, -3.6, width, 0.6), seg2(5.4, -3.6, 5.4, 3.8, width, 0.58)];
    if (cycle === 1) return [seg2(-6.6, 2.8, -6.6, -2.2, width, 0.55), seg2(-6.6, 2.8, 6.6, 2.8, width, 0.6), seg2(6.6, 2.8, 6.6, -2.2, width, 0.55)];
    if (cycle === 2) return [seg2(4.8, -5.2, 4.8, 5.2, width, 0.58), seg2(4.8, -5.2, -3.2, -5.2, width, 0.55), seg2(4.8, 5.2, -3.2, 5.2, width, 0.55)];
    if (cycle === 3) return [...box(-4.2, -2.4, 1.1, 0.7, width, 0.48), ...box(0, -2.4, 1.6, 0.7, width, 0.52), ...box(4.2, -2.4, 0.8, 0.7, width, 0.46), ...box(-4.6, 1.2, 0.7, 1.6, width, 0.48), ...box(4.6, 1.6, 0.7, 1.2, width, 0.48)];
    return [seg2(-2.2, -6.2, -2.2, 5.4, width, 0.58), seg2(-2.2, -6.2, 2.2, -6.2, width, 0.55), seg2(2.2, -6.2, 2.2, 5.4, width, 0.58)];
  }
  function staggered(cycle, width) {
    if (cycle === 0) return poly([[-6.4, -4.2], [-2.2, -4.2], [-2.2, -1.2], [1.8, -1.2], [1.8, 1.8], [6.2, 1.8]], width, 0.6);
    if (cycle === 1) return poly([[-6.6, -3.4], [0.4, -3.4], [0.4, 3.6], [6.6, 3.6]], width, 0.62);
    if (cycle === 2) return poly([[-6.2, -5], [-3.6, -5], [-3.6, -2.4], [-1, -2.4], [-1, 0.2], [1.6, 0.2], [1.6, 2.8], [4.2, 2.8], [4.2, 5.2]], width, 0.55);
    if (cycle === 3) return [...poly([[-6.4, -3.6], [-1.2, -3.6], [-1.2, 0.4], [2.4, 0.4]], width, 0.58), ...box(5.2, 2.6, 1.1, 1.6, width, 0.46)];
    return poly([[-5.8, 4.6], [-5.8, 1.2], [-1.6, 1.2], [-1.6, -1.6], [2.4, -1.6], [2.4, -4.8], [6.2, -4.8]], width, 0.58);
  }
  function spine(cycle, width) {
    if (cycle === 0) return [seg2(-2.2, 0, 6.8, 0, width, 0.66), seg2(0, -2.4, 0, 5.6, width, 0.6)];
    if (cycle === 1) return [seg2(-6.4, 0, 6.4, 0, width, 0.66), seg2(0, 0, 0, 5.8, width, 0.58)];
    if (cycle === 2) return [seg2(-5.2, -1.6, 4.2, -1.6, width, 0.62), seg2(1.4, -4.8, 1.4, 3.6, width, 0.58)];
    if (cycle === 3) return [seg2(-6.2, 0, 4.6, 0, width, 0.64), seg2(0, -3.2, 0, 3.2, width, 0.56), ...box(5.8, 0, 1.1, 1.4, width, 0.46)];
    return [seg2(-5.6, 0, 6.2, 0, width, 0.64), seg2(0, -0.8, 0, 5.4, width, 0.55), seg2(-2.4, 0, -2.4, -1.4, width, 0.4)];
  }
  function court(cycle, width) {
    if (cycle === 0) return [seg2(-4.4, -3.4, 1.2, -3.4, width, 0.56), seg2(3.2, -3.4, 4.4, -3.4, width, 0.56), seg2(-4.4, -3.4, -4.4, 3.4, width, 0.55), seg2(4.4, -3.4, 4.4, 3.4, width, 0.55), seg2(-4.4, 3.4, 4.4, 3.4, width, 0.56)];
    if (cycle === 1) return [seg2(-6.2, -2.2, 6.2, -2.2, width, 0.55), seg2(-6.2, 2.2, 6.2, 2.2, width, 0.55), seg2(-6.2, -2.2, -6.2, 2.2, width, 0.52), seg2(6.2, -2.2, 6.2, 0.2, width, 0.48), seg2(6.2, 1.2, 6.2, 2.2, width, 0.48)];
    if (cycle === 2) return [...box(0, 0, 4.6, 3.4, width, 0.54), seg2(-0.6, -3.4, 0.8, -3.4, width, 0.3), ...plus(0, 0, 1.2, 0.8, width, 0.4)];
    if (cycle === 3) return [...box(0, 0, 5.2, 3.6, width, 0.54), seg2(-0.8, -3.6, 0.8, -3.6, width, 0.28), seg2(-0.8, -3.6, -0.8, -2.2, width, 0.4), seg2(0.8, -3.6, 0.8, -2.2, width, 0.4)];
    return [...box(-3.2, 0, 2.2, 2.6, width, 0.54), ...box(3.4, 0, 1.6, 2.6, width, 0.5), seg2(1.6, -2.6, 1.6, -0.6, width, 0.4)];
  }
  function loose(cycle, width) {
    if (cycle === 0) return [...box(-4.2, 0.2, 2.4, 2, width, 0.58), ...box(5.2, -0.4, 0.7, 0.6, width, 0.44)];
    if (cycle === 1) return [...box(-4.2, 0.2, 2.4, 2, width, 0.56), seg2(-1.6, 0.2, 4.2, 0.2, width, 0.4), ...box(5.2, -0.4, 0.7, 0.6, width, 0.44)];
    if (cycle === 2) return [...box(0, -4.2, 2.2, 1.2, width, 0.56), ...box(0.4, 4.6, 0.6, 0.8, width, 0.42)];
    if (cycle === 3) return [...plus(-4.4, 0.6, 2.2, 1.4, width, 0.55), ...box(4.8, -0.8, 1.1, 1.6, width, 0.48)];
    return [...box(-5.2, 2.4, 1.8, 1.3, width, 0.55), ...box(4.6, 2.8, 0.7, 0.55, width, 0.42), ...plus(0.2, -4.2, 0.45, 0.9, width, 0.4)];
  }
  function pinwheel(cycle, width) {
    const arms = [
      [6.2, 3.4, 5.4, 2.2],
      [3.2, 6.4, 4.2, 5.2],
      [7, 2.4, 3.6, 6],
      [4.4, 4.8, 6.6, 2.6],
      [5.6, 5.2, 2.8, 6.2]
    ][cycle];
    const gap = 1.5;
    const marks = [
      seg2(gap, 0, arms[0], 0, width, 0.62),
      seg2(0, gap, 0, arms[1], width, 0.56),
      seg2(-gap, 0, -arms[2], 0, width, 0.58),
      seg2(0, -gap, 0, -arms[3], width, 0.5)
    ];
    if (cycle === 4) marks.pop();
    if (cycle === 2) marks.push(...box(arms[0], 0, 0.7, 0.9, width, 0.4));
    return marks;
  }
  function merged(cycle, width) {
    if (cycle === 0) return poly([[-5.4, -3.8], [5.4, -3.8], [5.4, 1.6], [2.2, 1.6], [2.2, 3.8], [-5.4, 3.8], [-5.4, -3.8]], width, 0.56);
    if (cycle === 1) return poly([[-3.4, -2.4], [6.2, -2.4], [6.2, 2.4], [-6.2, 2.4], [-6.2, 0.4], [-3.4, 0.4], [-3.4, -2.4]], width, 0.55);
    if (cycle === 2) return poly([[-3.6, -2.6], [3.6, -2.6], [3.6, 5.2], [-3.6, 5.2], [-3.6, -2.6], [-1.2, -2.6], [-1.2, -5.2], [1.4, -5.2], [1.4, -2.6]], width, 0.55);
    if (cycle === 3) return poly([[-2.6, -3.8], [5.4, -3.8], [5.4, 3.8], [-5.4, 3.8], [-5.4, 1.2], [-2.6, 1.2], [-2.6, -1.4], [-5.4, -1.4], [-5.4, -3.8], [-2.6, -3.8]], width, 0.54);
    return poly([[-4.8, -4.2], [4.8, -4.2], [4.8, 2.2], [1.6, 2.2], [1.6, 4.2], [-4.8, 4.2], [-4.8, -4.2]], width, 0.54);
  }
  function lanes(cycle, width) {
    if (cycle === 0) return [seg2(-7.2, -3.6, 7.2, -3.6, width, 0.6), seg2(-7.2, 3.6, 7.2, 3.6, width, 0.6)];
    if (cycle === 1) return [seg2(-7, -0.7, 7, -0.7, width, 0.62), seg2(-7, 0.7, 7, 0.7, width, 0.62)];
    if (cycle === 2) return [seg2(-7.2, -2.4, 6.4, -2.4, width, 0.6), seg2(-3.2, 2.8, 7.2, 2.8, width, 0.5)];
    if (cycle === 3) return [seg2(-7.2, -3.2, 7.2, -3.2, width, 0.58), seg2(-2.2, 0.2, 3.4, 0.2, width, 0.46), seg2(-7.2, 3.4, 7.2, 3.4, width, 0.58)];
    return [seg2(-7.4, -2.2, 7.4, -2.2, width, 0.62), seg2(-6.2, 1.4, -3.4, 1.4, width, 0.44), seg2(-0.6, 1.4, 2.2, 1.4, width, 0.44), seg2(4.4, 1.4, 6.8, 1.4, width, 0.44)];
  }
  function endBand(cycle, width) {
    if (cycle === 0) return [...box(-1.6, -4.6, 0.7, 0.55, width, 0.48), ...box(0.2, -4.6, 0.45, 0.7, width, 0.46), ...box(1.6, -4.8, 0.6, 0.4, width, 0.44), ...box(-0.4, -3.2, 0.35, 0.35, width, 0.42), seg2(-6.4, 4.8, 6.4, 4.8, width, 0.6)];
    if (cycle === 1) return [...box(-5.2, -1.2, 0.6, 0.5, width, 0.48), ...box(-5.2, 0.4, 0.45, 0.7, width, 0.46), ...box(-5.4, 1.8, 0.7, 0.4, width, 0.44), seg2(4.6, -6.2, 4.6, 6.2, width, 0.62)];
    if (cycle === 2) return [...plus(-1.2, -4.4, 0.8, 0.4, width, 0.46), ...plus(0.8, -4.6, 0.4, 0.7, width, 0.44), ...plus(2.2, -4.2, 0.55, 0.35, width, 0.42), seg2(-6.2, 4.6, 5.4, 4.6, width, 0.58)];
    if (cycle === 3) return [...box(-1.4, -4.4, 0.8, 0.5, width, 0.48), ...box(0.6, -4.6, 0.5, 0.7, width, 0.46), ...box(0, 4.4, 2.4, 1.1, width, 0.55)];
    return [...box(-5.2, 1.2, 1.4, 0.6, width, 0.52), ...box(-5.4, -0.6, 0.6, 0.45, width, 0.44), ...box(4.8, -1.4, 0.5, 0.8, width, 0.46), ...box(5.2, 0.8, 0.9, 0.4, width, 0.48), seg2(-2.2, 0, 2.2, 0, width, 0.4)];
  }
  function raft(cycle, width) {
    if (cycle === 0) return [...box(-5.4, 0, 0.5, 0.45, width, 0.44), ...box(-2.8, 0, 1, 0.8, width, 0.5), ...box(0.6, 0, 2.1, 1.5, width, 0.58), ...box(4.2, 0, 0.9, 0.7, width, 0.48), ...box(6.2, 0, 0.45, 0.4, width, 0.42)];
    if (cycle === 1) return [...box(-5.2, 0, 2.2, 1.4, width, 0.58), ...box(-1.2, 0, 0.45, 0.4, width, 0.42), ...box(1.2, 0, 0.5, 0.55, width, 0.44), ...box(4.6, 0, 1.3, 1, width, 0.52)];
    if (cycle === 2) return [...box(0, -5.2, 0.5, 0.45, width, 0.44), ...box(0, -2.4, 0.9, 1, width, 0.5), ...box(0, 1.2, 1.5, 1.8, width, 0.58), ...box(0, 4.8, 0.55, 0.6, width, 0.44)];
    if (cycle === 3) return [...box(-4.6, 0, 2.4, 1.8, width, 0.58), ...box(0.4, 0, 0.4, 0.35, width, 0.4), ...box(4.4, 0, 1.2, 0.7, width, 0.48)];
    return [...box(-5.2, -2.4, 0.6, 0.45, width, 0.44), ...box(-2.2, -0.6, 1, 0.8, width, 0.5), ...box(1.2, 1.2, 1.6, 1.2, width, 0.56), ...box(4.8, 3.2, 0.7, 0.5, width, 0.44)];
  }
  function ribbons(cycle, width) {
    if (cycle === 0) return poly([[-6.4, -3.6], [2.2, -3.6], [2.2, -0.8], [-4.2, -0.8], [-4.2, 2], [5.6, 2], [5.6, 4.6], [-1.2, 4.6]], width, 0.58);
    if (cycle === 1) return poly([[-2.4, -2.2], [2.6, -2.2], [2.6, 0.2], [-2.2, 0.2], [-2.2, 2.4], [2.4, 2.4]], width, 0.6);
    if (cycle === 2) return [...poly([[-6.2, -4], [4.2, -4], [4.2, -1.2], [-3.2, -1.2], [-3.2, 1.6], [5.4, 1.6]], width, 0.56), seg2(-6.4, 4.4, 6.4, 4.4, width, 0.42)];
    if (cycle === 3) return [...poly([[-5.2, 1.2], [-1.2, 1.2], [-1.2, 4.2], [2.4, 4.2]], width, 0.55), ...box(3.6, -2.6, 1.4, 1, width, 0.46)];
    return poly([[-4.6, -5.4], [-4.6, -1.6], [1.2, -1.6], [1.2, 1.4], [-3.4, 1.4], [-3.4, 5.2], [4.8, 5.2]], width, 0.56);
  }
  function nested(cycle, width) {
    const outer = [seg2(-6.2, -4.4, 6.2, -4.4, width, 0.56), seg2(-6.2, 4.4, 6.2, 4.4, width, 0.56), seg2(-6.2, -4.4, -6.2, 4.4, width, 0.52)];
    const mid = [seg2(-3.4, -2.2, 3.4, -2.2, width, 0.48), seg2(3.4, -2.2, 3.4, 2.2, width, 0.46), seg2(-3.4, 2.2, 3.4, 2.2, width, 0.48)];
    const inner = [seg2(-1.2, -0.8, 1.2, -0.8, width, 0.4), seg2(-1.2, -0.8, -1.2, 0.8, width, 0.4), seg2(-1.2, 0.8, 1.2, 0.8, width, 0.4)];
    if (cycle === 0) return [...outer, ...mid, ...inner];
    if (cycle === 1) return [...outer, ...mid];
    if (cycle === 2) return [...box(0, 0, 6, 4.2, width, 0.55), ...plus(0, 0, 2.2, 1.3, width, 0.42)];
    if (cycle === 3) return [...box(-1.4, 0.8, 4.6, 3.2, width, 0.54), ...box(1.6, -0.8, 2.2, 1.4, width, 0.44)];
    return [...outer, ...box(-1.2, 0, 0.7, 0.5, width, 0.4), ...box(1.4, 0, 1.1, 0.8, width, 0.44), ...box(3.6, 0, 0.45, 0.4, width, 0.4)];
  }
  function comb(cycle, width) {
    if (cycle === 0) return [seg2(-4.2, -4.6, -4.2, 4.6, width, 0.64), seg2(-4.2, -3.2, -1.6, -3.2, width, 0.48), seg2(-4.2, 0, 2.4, 0, width, 0.55), seg2(-4.2, 3.2, -0.4, 3.2, width, 0.46)];
    if (cycle === 1) return [seg2(-3.6, -5, -3.6, 5, width, 0.64), seg2(-3.6, -2.4, 3.6, -2.4, width, 0.55), seg2(-3.6, 3.2, 0.2, 3.2, width, 0.46)];
    if (cycle === 2) return [seg2(4.2, -4.8, 4.2, 4.8, width, 0.64), seg2(4.2, -3, -1.4, -3, width, 0.5), seg2(4.2, 0.2, -3.2, 0.2, width, 0.56), seg2(4.2, 3.4, 1.2, 3.4, width, 0.44)];
    if (cycle === 3) return [seg2(-4.4, -4.4, -4.4, 4.4, width, 0.6), seg2(4.4, -4.4, 4.4, 4.4, width, 0.55), seg2(-4.4, -2.6, 1.2, -2.6, width, 0.48), seg2(-2.2, 0.4, 4.4, 0.4, width, 0.48), seg2(-4.4, 3, 2.6, 3, width, 0.5)];
    return [seg2(-4.6, -5.2, -4.6, 3.6, width, 0.62), seg2(-4.6, -3.4, 1.6, -3.4, width, 0.5), seg2(-4.6, 0, 3.4, 0, width, 0.54), seg2(-4.6, 3.2, 0.4, 3.2, width, 0.46), ...box(-4.6, -5.6, 1.2, 0.45, width, 0.42)];
  }
  function familyMarks2(plan) {
    const width = 0.32 + plan.index % 5 * 0.04;
    switch (plan.kind) {
      case "equal-grid":
        return equalGrid(plan.cycle, width);
      case "wide-bays":
        return wideHalls(plan.cycle, width);
      case "tall-bays":
        return tallHalls(plan.cycle, width);
      case "offset-rows":
        return offsetRows(plan.cycle, width);
      case "side-aisle":
        return sideAisle(plan.cycle, width);
      case "double-aisle":
        return doubleAisle(plan.cycle, width);
      case "corner-clusters":
        return cornerClusters(plan.cycle, width);
      case "open-frame":
        return openFrame(plan.cycle, width);
      case "staggered":
        return staggered(plan.cycle, width);
      case "spine":
        return spine(plan.cycle, width);
      case "court":
        return court(plan.cycle, width);
      case "loose":
        return loose(plan.cycle, width);
      case "pinwheel":
        return pinwheel(plan.cycle, width);
      case "merged":
        return merged(plan.cycle, width);
      case "lanes":
        return lanes(plan.cycle, width);
      case "end-band":
        return endBand(plan.cycle, width);
      case "raft":
        return raft(plan.cycle, width);
      case "ribbons":
        return ribbons(plan.cycle, width);
      case "nested":
        return nested(plan.cycle, width);
      case "comb":
        return comb(plan.cycle, width);
      default:
        return equalGrid(plan.cycle, width);
    }
  }
  function place3(marks, plan) {
    const cos = plan.turn === 0 ? 1 : 0;
    const sin = plan.turn === 0 ? 0 : 1;
    const flip = plan.flip ? -1 : 1;
    const map = (u, v) => {
      const sv = v * flip;
      return {
        x: lim6(CENTER5 + plan.driftX + u * cos - sv * sin),
        y: lim6(CENTER5 + plan.driftY + u * sin + sv * cos)
      };
    };
    return marks.map((mark) => {
      const a = map(mark.u, mark.v);
      const b = map(mark.u2, mark.v2);
      return {
        kind: "line",
        x: a.x,
        y: a.y,
        x2: b.x,
        y2: b.y,
        radius: mark.radius,
        strength: mark.strength
      };
    });
  }
  function attractorsFromOpenHall(plan, _seed, _attempt = 0) {
    return place3(familyMarks2(plan), plan);
  }

  // lib/skill1/run-topographic-ground-field.ts
  var CENTER6 = (FIELD_SIZE - 1) / 2;
  var EDGE7 = 1.2;
  var lim7 = (value) => Math.min(FIELD_SIZE - EDGE7, Math.max(EDGE7, value));
  var TWISTS = [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, 0.7, -1.05];
  function frame6(rng) {
    return {
      r: (min, max) => min + rng() * (max - min),
      int: (min, max) => Math.floor(min + rng() * (max - min + 1)),
      chance: (p) => rng() < p,
      pick: (items) => items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
    };
  }
  var TERRAIN_FAMILIES = [
    "rolling",
    "valley",
    "plateau",
    "dune",
    "basin",
    "ridge",
    "terrace",
    "mounds",
    "channel",
    "hollow",
    "ripple",
    "crater",
    "layered",
    "spine",
    "slope",
    "organic",
    "pockets",
    "flowing",
    "depression",
    "commons"
  ];
  var GROWTH_MODES3 = [
    "mesh",
    "filament",
    "sparse",
    "bloom",
    "mass",
    "wander",
    "committed",
    "patchy"
  ];
  var GROUND_FIGURES = ["pads", "carve"];
  function pt2(x, y, radius, strength, hole2 = false) {
    return { kind: hole2 ? "ring" : "point", x: lim7(x), y: lim7(y), radius, strength, hole: hole2 };
  }
  function rotate3(x, y, plan) {
    const dx = (x - CENTER6) * plan.scale * (plan.flip ? -1 : 1);
    const dy = (y - CENTER6) * plan.scale;
    const c = Math.cos(plan.twist);
    const s = Math.sin(plan.twist);
    return {
      x: lim7(plan.originX + dx * c - dy * s),
      y: lim7(plan.originY + dx * s + dy * c)
    };
  }
  function place4(marks, plan) {
    return marks.map((mark) => {
      const a = rotate3(mark.x, mark.y, plan);
      const out = { ...mark, x: a.x, y: a.y, radius: (mark.radius ?? 1.2) * plan.scale };
      if (mark.x2 != null && mark.y2 != null) {
        const b = rotate3(mark.x2, mark.y2, plan);
        out.x2 = b.x;
        out.y2 = b.y;
      }
      if (mark.cx != null && mark.cy != null) {
        const c = rotate3(mark.cx, mark.cy, plan);
        out.cx = c.x;
        out.cy = c.y;
      }
      return out;
    });
  }
  function isPad(mark) {
    return mark.kind !== "line" && mark.kind !== "curve" && mark.hole !== true;
  }
  function spreadPads(pads) {
    const points = pads.map((pad) => ({ x: pad.x, y: pad.y, radius: pad.radius, strength: pad.strength }));
    const gap = 5.6;
    for (let pass = 0; pass < 10; pass += 1) {
      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          let dx = points[j].x - points[i].x;
          let dy = points[j].y - points[i].y;
          let d = Math.hypot(dx, dy);
          if (d >= gap) continue;
          if (d < 0.01) {
            dx = 1;
            dy = 0.2;
            d = Math.hypot(dx, dy);
          }
          const push = (gap - d) / 2;
          points[i].x = lim7(points[i].x - dx / d * push);
          points[i].y = lim7(points[i].y - dy / d * push);
          points[j].x = lim7(points[j].x + dx / d * push);
          points[j].y = lim7(points[j].y + dy / d * push);
        }
      }
    }
    return points;
  }
  function growMarks(marks, growth, figure, _kind, _f) {
    const radiusMul = growth === "mass" ? 1.12 : growth === "bloom" ? 1.04 : growth === "filament" ? 0.9 : growth === "sparse" ? 0.88 : 1;
    const open = figure === "carve" ? 0.82 : 1;
    const pads = spreadPads(marks.filter(isPad));
    return pads.map((pad) => {
      let nearest = 8;
      for (const other of pads) {
        if (other === pad) continue;
        nearest = Math.min(nearest, Math.hypot(pad.x - other.x, pad.y - other.y));
      }
      const want = Math.max(1.7, (pad.radius ?? 2.1) * open * radiusMul);
      const radius = Math.min(want, Math.max(1.55, nearest * 0.34));
      return pt2(pad.x, pad.y, radius, (pad.strength ?? 0.45) * 0.7);
    });
  }
  function familyMarks3(kind, f) {
    const marks = [];
    if (kind === "rolling") {
      for (let i = 0; i < 4; i += 1) {
        marks.push(pt2(4.2 + i * 3.6 + f.r(-0.2, 0.2), CENTER6 + Math.sin(i * 0.95) * f.r(1.2, 2.4), f.r(1.9, 2.4), 0.48));
      }
      return marks;
    }
    if (kind === "valley") {
      marks.push(pt2(5.2, CENTER6 - 2.8, 2.4, 0.5));
      marks.push(pt2(10, CENTER6 - 2.4, 2.2, 0.46));
      marks.push(pt2(14.8, CENTER6 - 2.6, 2.4, 0.5));
      marks.push(pt2(5.4, CENTER6 + 2.8, 2.4, 0.5));
      marks.push(pt2(10.2, CENTER6 + 2.5, 2.2, 0.46));
      marks.push(pt2(14.6, CENTER6 + 2.7, 2.4, 0.5));
      return marks;
    }
    if (kind === "plateau") {
      marks.push(pt2(CENTER6 - 1.6, CENTER6 - 0.4, 3.6, 0.58));
      marks.push(pt2(CENTER6 + 2.4, CENTER6 + 1.1, 3.2, 0.52));
      marks.push(pt2(CENTER6 + 0.4, CENTER6 + 2.8, 2.3, 0.4));
      return marks;
    }
    if (kind === "dune") {
      for (let i = 0; i < 3; i += 1) {
        const y = 6.2 + i * 3.6;
        marks.push(pt2(5.4, y + f.r(-0.3, 0.3), 2.3, 0.46));
        marks.push(pt2(10, y + (i % 2 ? 1.2 : -1.2), 2.5, 0.48));
        marks.push(pt2(14.6, y + f.r(-0.3, 0.3), 2.3, 0.46));
      }
      return marks;
    }
    if (kind === "basin") {
      for (let i = 0; i < 5; i += 1) {
        const a = i / 5 * Math.PI * 2 + f.r(-0.15, 0.15);
        marks.push(pt2(CENTER6 + Math.cos(a) * 4.8, CENTER6 + Math.sin(a) * 4.8, f.r(2.2, 2.9), 0.5));
      }
      return marks;
    }
    if (kind === "ridge") {
      for (let i = 0; i < 5; i += 1) {
        marks.push(pt2(4.8 + i * 2.6, CENTER6 + (i % 2 ? 1.6 : -1.6), f.r(2, 2.6), 0.48));
      }
      return marks;
    }
    if (kind === "terrace") {
      for (let i = 0; i < 4; i += 1) {
        const y = 5.4 + i * 3;
        marks.push(pt2(6.2, y, 2.2, 0.4 + i * 0.04));
        marks.push(pt2(13.6, y, 2.2, 0.4 + i * 0.04));
      }
      return marks;
    }
    if (kind === "mounds") {
      const spots = [
        [6.2, 7.2],
        [12.2, 6.4],
        [14.4, 11.2],
        [9.2, 13.4],
        [5.6, 11.6]
      ];
      for (const [x, y] of spots) marks.push(pt2(x + f.r(-0.4, 0.4), y + f.r(-0.4, 0.4), f.r(2.3, 3.2), 0.52));
      return marks;
    }
    if (kind === "channel") {
      marks.push(pt2(5.4, 6.2, 2.3, 0.46));
      marks.push(pt2(9.6, 9.8, 2.5, 0.5));
      marks.push(pt2(14.4, 13.6, 2.3, 0.46));
      marks.push(pt2(5.8, 13.8, 2.2, 0.44));
      marks.push(pt2(14.2, 6.4, 2.2, 0.44));
      return marks;
    }
    if (kind === "hollow") {
      marks.push(pt2(CENTER6 - 3.2, CENTER6, 2.6, 0.48));
      marks.push(pt2(CENTER6 + 3.2, CENTER6, 2.6, 0.48));
      marks.push(pt2(CENTER6, CENTER6 - 3.1, 2.4, 0.44));
      marks.push(pt2(CENTER6, CENTER6 + 3.1, 2.4, 0.44));
      return marks;
    }
    if (kind === "ripple") {
      for (let i = 0; i < 5; i += 1) {
        const y = 5 + i * 2.5;
        marks.push(pt2(6.2 + (i % 2 ? 1.6 : 0), y, 2, 0.42));
        marks.push(pt2(13.4 - (i % 2 ? 1.6 : 0), y, 2, 0.42));
      }
      return marks;
    }
    if (kind === "crater") {
      for (let i = 0; i < 5; i += 1) {
        const a = i / 5 * Math.PI * 2 + f.r(-0.12, 0.12);
        marks.push(pt2(CENTER6 + Math.cos(a) * 5.2, CENTER6 + Math.sin(a) * 4.6, f.r(1.8, 2.3), 0.46));
      }
      return marks;
    }
    if (kind === "layered") {
      for (let i = 0; i < 4; i += 1) {
        const t = i / 3;
        marks.push(pt2(CENTER6 - 3.4 + t * 1.2, 5.6 + t * 8.2, 2.3, 0.4 + t * 0.1));
        marks.push(pt2(CENTER6 + 3.4 - t * 1.2, 5.6 + t * 8.2, 2.3, 0.4 + t * 0.1));
      }
      return marks;
    }
    if (kind === "spine") {
      marks.push(pt2(6.4, 6.6, 2.4, 0.48));
      marks.push(pt2(10, 10, 2.8, 0.54));
      marks.push(pt2(13.8, 13.4, 2.4, 0.48));
      marks.push(pt2(8.2, 12.6, 2, 0.4));
      return marks;
    }
    if (kind === "slope") {
      for (let i = 0; i < 4; i += 1) {
        const t = i / 3;
        marks.push(pt2(CENTER6, 5.4 + t * 8.6, 2.6 - t * 0.7, 0.36 + t * 0.14));
      }
      return marks;
    }
    if (kind === "organic") {
      for (let i = 0; i < 5; i += 1) {
        marks.push(pt2(5.6 + i * 2.2 + f.r(-0.5, 0.5), 5.8 + i * 1.7 + f.r(-0.8, 0.8), f.r(1.9, 2.6), 0.44));
      }
      return marks;
    }
    if (kind === "pockets") {
      for (let i = 0; i < 7; i += 1) {
        const a = i / 7 * Math.PI * 2 + f.r(-0.2, 0.2);
        marks.push(pt2(CENTER6 + Math.cos(a) * f.r(3.4, 6.2), CENTER6 + Math.sin(a) * f.r(3.2, 5.8), f.r(1.7, 2.3), 0.42));
      }
      return marks;
    }
    if (kind === "flowing") {
      marks.push(pt2(5.2, 7.4, 2.3, 0.46));
      marks.push(pt2(9.2, 6.2, 2.2, 0.44));
      marks.push(pt2(13.8, 8.8, 2.4, 0.48));
      marks.push(pt2(12.4, 13.2, 2.3, 0.46));
      marks.push(pt2(7.2, 12.8, 2.2, 0.44));
      return marks;
    }
    if (kind === "depression") {
      marks.push(pt2(CENTER6 - 2.8, CENTER6 + 0.4, 3.2, 0.52));
      marks.push(pt2(CENTER6 + 3.1, CENTER6 + 1.4, 3, 0.5));
      marks.push(pt2(CENTER6, CENTER6 - 3, 2.6, 0.46));
      return marks;
    }
    marks.push(pt2(CENTER6, CENTER6, 3.2, 0.5));
    for (let i = 0; i < 6; i += 1) {
      const a = i / 6 * Math.PI * 2 + f.r(-0.2, 0.2);
      marks.push(pt2(CENTER6 + Math.cos(a) * f.r(4.4, 6.6), CENTER6 + Math.sin(a) * f.r(4.2, 6.2), f.r(1.8, 2.5), 0.42));
    }
    return marks;
  }
  var LINEAR_KINDS = ["channel", "spine", "ridge", "valley", "flowing"];
  var LINEAR_GROWTH = ["filament", "sparse", "mesh"];
  function planTopographicGroundField(seed, attempt = 0, index2 = 0) {
    const rng = mulberry32(seed ^ 7401485 ^ attempt * 668265261 ^ index2 * 2654435769);
    const f = frame6(rng);
    const linearPass = attempt > 0;
    return {
      kind: linearPass ? LINEAR_KINDS[(index2 + attempt) % LINEAR_KINDS.length] : TERRAIN_FAMILIES[(index2 * 7 + attempt * 5) % TERRAIN_FAMILIES.length],
      growth: linearPass ? LINEAR_GROWTH[attempt % LINEAR_GROWTH.length] : GROWTH_MODES3[(index2 * 11 + attempt * 3) % GROWTH_MODES3.length],
      figure: GROUND_FIGURES[Math.floor(index2 / 20) + index2 + attempt & 1],
      index: index2,
      scale: f.r(0.74, 1.12),
      originX: CENTER6 + f.r(-1.4, 1.4),
      originY: CENTER6 + f.r(-1.4, 1.4),
      twist: TWISTS[(index2 * 3 + attempt) % TWISTS.length] + f.r(-0.2, 0.2),
      flip: (index2 + attempt & 1) === 1
    };
  }
  function attractorsFromTopographic(plan, seed, attempt = 0) {
    const rng = mulberry32(seed ^ 118431261 ^ attempt * 2246822507 ^ plan.index * 374761393);
    const f = frame6(rng);
    return place4(growMarks(familyMarks3(plan.kind, f), plan.growth, plan.figure, plan.kind, f), plan);
  }
  function slimeFromTopographic(base2, plan, seed) {
    const rng = mulberry32(seed ^ 5357790 ^ plan.index ^ plan.growth.length);
    const f = frame6(rng);
    const byGrowth = {
      mesh: {
        persistence: f.r(0.48, 0.78),
        trailInfluence: f.r(0.8, 1.5),
        deposit: f.r(0.08, 0.16),
        depositWidth: f.r(1.2, 2),
        diffusion: f.r(0.06, 0.12),
        randomness: f.r(0.08, 0.26),
        trailCap: f.r(0.85, 1.5)
      },
      filament: {
        persistence: f.r(0.62, 0.86),
        trailInfluence: f.r(1, 1.7),
        deposit: f.r(0.04, 0.09),
        depositWidth: f.r(0.7, 1.15),
        diffusion: f.r(0.03, 0.07),
        randomness: f.r(0.05, 0.2),
        trailCap: f.r(0.55, 1.05)
      },
      sparse: {
        persistence: f.r(0.32, 0.58),
        trailInfluence: f.r(0.45, 0.95),
        deposit: f.r(0.04, 0.1),
        depositWidth: f.r(0.85, 1.4),
        diffusion: f.r(0.03, 0.07),
        randomness: f.r(0.18, 0.42),
        trailCap: f.r(0.5, 1.05)
      },
      bloom: {
        persistence: f.r(0.38, 0.66),
        trailInfluence: f.r(0.55, 1.2),
        deposit: f.r(0.07, 0.16),
        depositWidth: f.r(1.3, 2.2),
        diffusion: f.r(0.08, 0.14),
        randomness: f.r(0.12, 0.36),
        trailCap: f.r(0.8, 1.45)
      },
      mass: {
        persistence: f.r(0.5, 0.8),
        trailInfluence: f.r(0.7, 1.4),
        deposit: f.r(0.12, 0.22),
        depositWidth: f.r(1.7, 2.6),
        diffusion: f.r(0.04, 0.1),
        randomness: f.r(0.05, 0.2),
        trailCap: f.r(1.15, 1.8)
      },
      wander: {
        persistence: f.r(0.28, 0.52),
        trailInfluence: f.r(0.4, 0.95),
        deposit: f.r(0.06, 0.13),
        depositWidth: f.r(1, 1.8),
        diffusion: f.r(0.05, 0.11),
        randomness: f.r(0.22, 0.48),
        trailCap: f.r(0.65, 1.25)
      },
      committed: {
        persistence: f.r(0.68, 0.9),
        trailInfluence: f.r(1.05, 1.75),
        deposit: f.r(0.07, 0.15),
        depositWidth: f.r(1.1, 1.9),
        diffusion: f.r(0.04, 0.09),
        randomness: f.r(0.04, 0.16),
        trailCap: f.r(0.8, 1.45)
      },
      patchy: {
        persistence: f.r(0.4, 0.7),
        trailInfluence: f.r(0.55, 1.25),
        deposit: f.r(0.08, 0.18),
        depositWidth: f.r(1.15, 2.1),
        diffusion: f.r(0.03, 0.08),
        randomness: f.r(0.1, 0.32),
        trailCap: f.r(0.7, 1.4)
      }
    };
    return {
      ...base2,
      ...byGrowth[plan.growth],
      sensorAngle: f.r(0.45, 0.75),
      sensorDistance: f.r(0.32, 0.55),
      turnAngle: f.r(0.28, 0.48),
      stepSize: f.r(0.12, 0.2),
      resistance: f.r(0.02, 0.08),
      decay: 0.998,
      trailInfluence: f.r(0.18, 0.32),
      randomness: f.r(0.28, 0.46),
      persistence: f.r(0.18, 0.34),
      diffusion: 0,
      voidElongation: 1,
      voidRotation: 0,
      voidLobes: 0,
      voidNotch: 0,
      foodPoints: []
    };
  }
  function paramsFromTopographic(base2, seed) {
    const rng = mulberry32(seed ^ 7404049);
    return {
      ...base2,
      attractionStrength: 0.06 + rng() * 0.08,
      networkDensity: 0.22 + rng() * 0.2,
      permeability: 0.48 + rng() * 0.42,
      flowCoupling: 0.12 + rng() * 0.16,
      geometryVariation: 0.2 + rng() * 0.2,
      directionalBias: 0.02
    };
  }
  function recipeFromTopographic(recipe, seed) {
    const rng = mulberry32(seed ^ 7400478);
    const f = frame6(rng);
    return {
      ...recipe,
      clustering: f.r(0.04, 0.42),
      isolationRadius: f.r(4.2, 6.8),
      approachWidth: f.r(2.8, 4.7),
      coreExposure: f.r(0.62, 0.96)
    };
  }
  function agentsFromTopographic(plan, seed) {
    const rng = mulberry32(seed ^ 7381278 ^ plan.index);
    const byGrowth = {
      mesh: [160, 200],
      filament: [150, 190],
      sparse: [140, 180],
      bloom: [160, 210],
      mass: [180, 230],
      wander: [150, 200],
      committed: [160, 200],
      patchy: [155, 200]
    };
    const [min, max] = byGrowth[plan.growth];
    const count = min + rng() * (max - min);
    return Math.round(plan.figure === "carve" ? count * 1.12 : count);
  }

  // lib/skill1/run-morphology.ts
  var CENTER7 = (FIELD_SIZE - 1) / 2;
  var lim8 = (value) => Math.min(FIELD_SIZE - 1.15, Math.max(1.15, value));
  function frame7(rng) {
    return {
      r: (min, max) => min + rng() * (max - min),
      int: (min, max) => Math.floor(min + rng() * (max - min + 1)),
      chance: (p) => rng() < p,
      pick: (items) => items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
    };
  }
  function hole(x, y, radius, strength = 1.1) {
    return { kind: "ring", x: lim8(x), y: lim8(y), radius, strength, hole: true };
  }
  function node2(x, y, radius, strength) {
    return { kind: "point", x: lim8(x), y: lim8(y), radius, strength };
  }
  function path(x, y, x2, y2, radius, strength, curve, bend = 0) {
    const mark = {
      kind: curve ? "curve" : "line",
      x: lim8(x),
      y: lim8(y),
      x2: lim8(x2),
      y2: lim8(y2),
      radius,
      strength
    };
    if (curve) {
      mark.cx = lim8((x + x2) / 2 - Math.sin(Math.atan2(y2 - y, x2 - x)) * bend);
      mark.cy = lim8((y + y2) / 2 + Math.cos(Math.atan2(y2 - y, x2 - x)) * bend);
    }
    return mark;
  }
  var VERTICAL_VOID_CORES = [
    "compact",
    "expanded",
    "elongated",
    "compressed",
    "irregular",
    "split",
    "lobed",
    "nested",
    "pinched",
    "branched",
    "offset",
    "openings"
  ];
  var VERTICAL_VOID_APPROACHES = ["single", "pair", "fan", "diagonal", "vertical", "tangential", "branching"];
  var VERTICAL_VOID_RELATIONS = ["tight", "loose", "one-side", "multi", "separated", "asymmetric"];
  function verticalVoidAspectBand(core) {
    if (core === "elongated") return [0.35, 2.5];
    if (core === "compressed") return [0.4, 0.85];
    if (core === "compact") return [0.8, 1.2];
    if (core === "expanded") return [0.7, 1.6];
    return [0.4, 2.2];
  }
  function coreRadius(core, f) {
    if (core === "compact") return f.pick([1.7, 2, 2.3]);
    if (core === "expanded") return f.pick([4.6, 5.1, 5.6]);
    if (core === "compressed") return f.pick([2.2, 2.6, 3]);
    return f.pick([2.6, 3.2, 3.8, 4.3]);
  }
  function buildCore(f, plan) {
    const { cx, cy, axis } = plan;
    const radius = coreRadius(plan.core, f);
    const primary = hole(cx, cy, radius);
    if (plan.core !== "split" && plan.core !== "branched") return [primary];
    const gap = radius + f.r(1.1, 2.2);
    const second = hole(cx + Math.cos(axis) * gap, cy + Math.sin(axis) * gap, radius * f.r(0.7, 0.95));
    if (plan.core === "split") return [primary, second];
    const side = hole(
      cx + Math.cos(axis + Math.PI / 2) * (radius + f.r(0.9, 1.6)),
      cy + Math.sin(axis + Math.PI / 2) * (radius + f.r(0.9, 1.6)),
      radius * f.r(0.55, 0.75)
    );
    return [primary, second, side];
  }
  function rimPoint(holes, angle, extra) {
    let best = holes[0];
    let bestR = 0;
    for (const item of holes) {
      const r = item.radius ?? 2;
      if (r > bestR) {
        best = item;
        bestR = r;
      }
    }
    const reach = (best.radius ?? 2) + extra;
    return { x: best.x + Math.cos(angle) * reach, y: best.y + Math.sin(angle) * reach, core: best, reach };
  }
  function buildApproaches(f, plan, holes) {
    const marks = [];
    const dirs = [];
    if (plan.approach === "single") dirs.push(plan.axis + f.r(-0.25, 0.25));
    else if (plan.approach === "pair") dirs.push(plan.axis, plan.axis + Math.PI);
    else if (plan.approach === "diagonal") dirs.push(plan.axis + Math.PI / 4);
    else if (plan.approach === "vertical") dirs.push(-Math.PI / 2 + f.r(-0.18, 0.18));
    else if (plan.approach === "tangential") dirs.push(plan.axis + Math.PI / 2);
    else if (plan.approach === "fan") {
      dirs.push(plan.axis - 0.7, plan.axis, plan.axis + 0.7);
    } else {
      dirs.push(plan.axis, plan.axis + 0.95);
    }
    for (let i = 0; i < dirs.length; i += 1) {
      const angle = dirs[i];
      const far = f.r(6.4, 8.6);
      const stop = plan.relation === "separated" ? f.r(1.2, 2) : f.r(0.25, 0.7);
      const rim = rimPoint(holes, angle, stop);
      const start2 = { x: plan.cx + Math.cos(angle) * far, y: plan.cy + Math.sin(angle) * far };
      marks.push(
        path(start2.x, start2.y, rim.x, rim.y, i === 0 ? f.r(1.4, 2.3) : f.r(0.8, 1.5), i === 0 ? 0.82 : 0.5, plan.approach !== "vertical", f.r(0.8, 2.6))
      );
    }
    const nodes = plan.relation === "one-side" ? 2 : f.int(3, 5);
    const start = plan.relation === "one-side" || plan.relation === "asymmetric" ? plan.axis - 0.8 : 0;
    const sweep = plan.relation === "one-side" ? Math.PI : Math.PI * 2;
    for (let i = 0; i < nodes; i += 1) {
      const a = start + i / nodes * sweep;
      const p = rimPoint(holes, a, f.r(1.4, 3.2));
      marks.push(node2(p.x, p.y, f.r(0.7, 1.4), f.r(0.28, 0.55)));
    }
    return marks;
  }
  function planVerticalVoid(seed, attempt = 0, index2 = 0) {
    const rng = mulberry32(seed ^ 10975943 ^ attempt * 2654435769 ^ index2 * 2246822507);
    const f = frame7(rng);
    const core = VERTICAL_VOID_CORES[index2 % VERTICAL_VOID_CORES.length];
    const col = index2 % 5;
    const row = Math.floor(index2 / 5) % 4;
    const [low, high] = verticalVoidAspectBand(core);
    return {
      core,
      approach: VERTICAL_VOID_APPROACHES[(index2 + attempt) % VERTICAL_VOID_APPROACHES.length],
      relation: VERTICAL_VOID_RELATIONS[Math.floor(index2 / 3) % VERTICAL_VOID_RELATIONS.length],
      cx: lim8(2.6 + col * 3.6 + f.r(-0.7, 0.7)),
      cy: lim8(2.8 + row * 4.3 + f.r(-0.8, 0.8)),
      axis: f.r(-Math.PI, Math.PI),
      span: f.r(3.2, 6.4),
      aspect: low + f.r(0, 1) * (high - low)
    };
  }
  function attractorsFromVerticalVoidPlan(plan, seed, attempt = 0) {
    const rng = mulberry32(seed ^ 5369869 ^ attempt * 2246822507);
    const f = frame7(rng);
    const holes = buildCore(f, plan);
    return [...holes, ...buildApproaches(f, plan, holes)];
  }
  function slimeFromVerticalVoidPlan(base2, plan, seed) {
    const rng = mulberry32(seed ^ 5357790);
    const clamp5 = (value, min, max) => Math.min(max, Math.max(min, value));
    const next = { ...base2 };
    next.voidElongation = clamp5(plan.aspect, 0.4, 2.4);
    next.voidRotation = plan.axis;
    next.voidLobes = 0;
    next.voidNotch = 0;
    next.trailInfluence = 0.22 + rng() * 0.16;
    next.resistance = 0.04 + rng() * 0.1;
    next.persistence = 0.28 + rng() * 0.2;
    next.sensorAngle = 0.35 + rng() * 0.25;
    next.sensorDistance = 0.4 + rng() * 0.3;
    next.turnAngle = 0.25 + rng() * 0.2;
    next.depositWidth = 0.14;
    next.deposit = 0.016;
    next.diffusion = 0;
    next.decay = 0.998;
    next.randomness = 0.2 + rng() * 0.14;
    next.foodPoints = [];
    return next;
  }
  function isVoid(item) {
    return item.hole === true || item.kind === "ring";
  }
  function extractMorphFeatures(snapshot, attractors) {
    const holes = attractors.filter(isVoid);
    let minX = FIELD_SIZE;
    let minY = FIELD_SIZE;
    let maxX = 0;
    let maxY = 0;
    let voidArea = 0;
    let voidCx = CENTER7;
    let voidCy = CENTER7;
    if (holes.length) {
      let w = 0;
      let sx = 0;
      let sy = 0;
      for (const item of holes) {
        const r = item.radius ?? 2;
        const mass = r * r;
        w += mass;
        sx += item.x * mass;
        sy += item.y * mass;
        minX = Math.min(minX, item.x - r);
        minY = Math.min(minY, item.y - r);
        maxX = Math.max(maxX, item.x + r);
        maxY = Math.max(maxY, item.y + r);
      }
      voidCx = sx / w;
      voidCy = sy / w;
      voidArea = w;
    }
    const width = Math.max(0.4, maxX - minX);
    const height = Math.max(0.4, maxY - minY);
    const voidAspect = width / height;
    const voidAngle = Math.atan2(maxY - minY, maxX - minX);
    const trails = snapshot.trails;
    const n = trails.length;
    let maxTrail = 0;
    for (let i = 0; i < n; i += 1) if (trails[i] > maxTrail) maxTrail = trails[i];
    const cut = maxTrail * 0.18;
    let occupied = 0;
    let density = 0;
    let rimContact = 0;
    let rimN = 0;
    const bins = Array.from({ length: 8 }, () => 0);
    const size = snapshot.trailSize || Math.sqrt(n);
    const scale = size / FIELD_SIZE;
    for (let i = 0; i < n; i += 1) {
      const value = trails[i];
      density += value;
      if (value < cut) continue;
      occupied += 1;
      const x = i % size / scale;
      const y = Math.floor(i / size) / scale;
      const dx = x - voidCx;
      const dy = y - voidCy;
      const d = Math.hypot(dx, dy);
      if (d > 0.4 && d < Math.max(width, height) * 0.7 + 2.2) {
        rimContact += value;
        rimN += 1;
        const bin = (Math.floor((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2) * 8) % 8 + 8) % 8;
        bins[bin] += 1;
      }
    }
    const branches = bins.filter((count) => count > occupied * 0.02).length;
    const grid = 16;
    const seen = new Uint8Array(grid * grid);
    let components = 0;
    const step = size / grid;
    const cellOn = (gx, gy) => {
      const x0 = Math.floor(gx * step);
      const y0 = Math.floor(gy * step);
      for (let y = y0; y < y0 + step && y < size; y += 1) {
        for (let x = x0; x < x0 + step && x < size; x += 1) {
          if (trails[y * size + x] >= cut) return true;
        }
      }
      return false;
    };
    const flood = (sx, sy) => {
      const stack = [sx + sy * grid];
      seen[sx + sy * grid] = 1;
      while (stack.length) {
        const i = stack.pop();
        const x = i % grid;
        const y = Math.floor(i / grid);
        for (const [nx, ny] of [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1]
        ]) {
          if (nx < 0 || ny < 0 || nx >= grid || ny >= grid) continue;
          const j = nx + ny * grid;
          if (seen[j] || !cellOn(nx, ny)) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
    };
    for (let gy = 0; gy < grid; gy += 1) {
      for (let gx = 0; gx < grid; gx += 1) {
        const i = gx + gy * grid;
        if (seen[i] || !cellOn(gx, gy)) continue;
        components += 1;
        flood(gx, gy);
      }
    }
    return {
      voidArea,
      voidCx,
      voidCy,
      voidAspect,
      voidAngle,
      occupied: occupied / Math.max(1, n),
      density: density / Math.max(1, n),
      rimContact: rimN ? rimContact / rimN : 0,
      branches,
      bins: bins.map((count) => count / Math.max(1, occupied)),
      components,
      approachCount: attractors.filter((item) => item.kind === "line" || item.kind === "curve").length,
      coreSpan: Math.max(width, height),
      openness: 1 - occupied / Math.max(1, n)
    };
  }
  function verticalVoidIdentity(features) {
    const centered = Math.hypot(features.voidCx - CENTER7, features.voidCy - CENTER7) < 5.2;
    const hasCore = features.voidArea > 2.2 && features.coreSpan > 2.4 && features.coreSpan < 14;
    const open = features.openness > 0.22;
    const engaged = features.rimContact > 2e-3 && features.branches >= 1;
    const approach = features.approachCount >= 1;
    return centered && hasCore && open && engaged && approach;
  }
  function featureVector(features) {
    return [
      features.voidArea / 40,
      features.voidCx / FIELD_SIZE,
      features.voidCy / FIELD_SIZE,
      Math.min(3, features.voidAspect) / 3,
      (features.voidAngle + Math.PI) / (Math.PI * 2),
      features.occupied,
      Math.min(1, features.density / 0.25),
      Math.min(1, features.rimContact / 0.08),
      features.branches / 8,
      features.components / 8,
      features.approachCount / 10,
      features.coreSpan / FIELD_SIZE,
      features.openness,
      ...features.bins
    ];
  }
  function morphDistance(a, b) {
    const va = featureVector(a);
    const vb = featureVector(b);
    let sum = 0;
    for (let i = 0; i < va.length; i += 1) {
      const d = va[i] - vb[i];
      sum += d * d;
    }
    return Math.sqrt(sum / va.length);
  }
  var NOVELTY_GAP = 0.11;
  function isNovelMorphology(features, previous2) {
    if (!previous2.length) return true;
    return previous2.every((item) => morphDistance(features, item) >= NOVELTY_GAP);
  }
  function pickMostNovel(candidates, previous2) {
    let best = 0;
    let bestScore = -1;
    for (let i = 0; i < candidates.length; i += 1) {
      const score = previous2.length ? Math.min(...previous2.map((item) => morphDistance(candidates[i], item))) : 1;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  // lib/skill1/run-variants.ts
  var CENTER8 = (FIELD_SIZE - 1) / 2;
  var REACH = CENTER8 - 1.4;
  var lim9 = (value) => Math.min(FIELD_SIZE - 1.2, Math.max(1.2, value));
  function frame8(rng) {
    return {
      r: (min, max) => min + rng() * (max - min),
      int: (min, max) => Math.floor(min + rng() * (max - min + 1)),
      chance: (p) => rng() < p,
      pick: (items) => items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
    };
  }
  function place5(layout2, rng, angles, hold = false) {
    const angle = angles[Math.floor(rng() * angles.length)] + (rng() - 0.5) * (hold ? 0.12 : 0.3);
    const flip = rng() < 0.5 ? -1 : 1;
    const driftSpan = hold ? 2.8 : 5.2;
    const drift = { x: (rng() - 0.5) * driftSpan, y: (rng() - 0.5) * driftSpan };
    const grow = hold ? 0.82 + rng() * 0.28 : 0.58 + rng() * 0.72;
    const shake = (amount) => (rng() - 0.5) * 2 * amount;
    const marks = layout2.map((mark) => {
      const isDisk = mark.kind === "point" || mark.kind === "ring";
      const wobble = hold ? 0.12 : isDisk ? 1.2 : 0.8;
      return {
        ...mark,
        u: mark.u * grow + shake(wobble),
        v: mark.v * grow + shake(wobble),
        u2: mark.u2 == null ? void 0 : mark.u2 * grow + shake(wobble),
        v2: mark.v2 == null ? void 0 : mark.v2 * grow + shake(wobble),
        cu: mark.cu == null ? void 0 : mark.cu * grow + shake(wobble),
        cv: mark.cv == null ? void 0 : mark.cv * grow + shake(wobble),
        radius: mark.radius * (hold ? 0.9 + rng() * 0.2 : 0.65 + rng() * 0.8),
        strength: mark.strength * (hold ? 0.9 + rng() * 0.2 : 0.7 + rng() * 0.6)
      };
    });
    let extent = 0;
    for (const mark of marks) {
      const pad = mark.kind === "point" || mark.kind === "ring" ? mark.radius : mark.radius * 0.5;
      const points = [
        [mark.u, mark.v],
        [mark.u2 ?? mark.u, mark.v2 ?? mark.v],
        [mark.cu ?? mark.u, mark.cv ?? mark.v]
      ];
      for (const [u, v] of points) extent = Math.max(extent, Math.abs(u) + pad, Math.abs(v) + pad);
    }
    const scale = Math.min(1, (REACH - Math.max(Math.abs(drift.x), Math.abs(drift.y))) / Math.max(extent, 1));
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const to = (u, v) => {
      const su = u * scale;
      const sv = v * scale * flip;
      return { x: lim9(CENTER8 + drift.x + su * cos - sv * sin), y: lim9(CENTER8 + drift.y + su * sin + sv * cos) };
    };
    return marks.map((mark) => {
      const a = to(mark.u, mark.v);
      const out = { kind: mark.kind, x: a.x, y: a.y, radius: mark.radius * scale, strength: mark.strength };
      if (mark.hole) out.hole = true;
      if (mark.kind === "line" || mark.kind === "curve") {
        const b = to(mark.u2 ?? mark.u, mark.v2 ?? mark.v);
        out.x2 = b.x;
        out.y2 = b.y;
      }
      if (mark.kind === "curve") {
        const c = to(mark.cu ?? mark.u, mark.cv ?? mark.v);
        out.cx = c.x;
        out.cy = c.y;
      }
      return out;
    });
  }
  var ORTHO = [0, Math.PI / 2];
  var CARDINAL = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  var ANY = [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4];
  function disk2(_f, kind, u, v, radius, strength, hole2 = false) {
    return { kind, u, v, radius, strength, hole: hole2 };
  }
  function seg3(_f, u1, v1, u2, v2, radius, strength) {
    return { kind: "line", u: u1, v: v1, u2, v2, radius, strength };
  }
  function arc(_f, u1, v1, u2, v2, cu, cv3, radius, strength) {
    return { kind: "curve", u: u1, v: v1, u2, v2, cu, cv: cv3, radius, strength };
  }
  function approachPath(f, fromU, fromV, toU, toV, width, strength) {
    if (f.chance(0.55)) {
      const midU = (fromU + toU) / 2 + f.r(-2.8, 2.8);
      const midV = (fromV + toV) / 2 + f.r(-2.8, 2.8);
      return arc(f, fromU, fromV, toU, toV, midU, midV, width, strength);
    }
    return seg3(f, fromU, fromV, toU, toV, width, strength);
  }
  function verticalVoid(_f) {
    return [];
  }
  function compressedSequential(_f) {
    return [];
  }
  function continuousHall(_f) {
    return [];
  }
  function topographicGroundField(_f) {
    return [];
  }
  function linearGallery(_f) {
    return [];
  }
  function openHall(_f) {
    return [];
  }
  function terraced(f) {
    const steps = f.int(3, 6);
    const pitch = f.r(2.2, 4.2);
    const shift = f.r(0.4, 2.2) * (f.chance(0.5) ? -1 : 1);
    const marks = [];
    for (let i = 0; i < steps; i += 1) {
      const v = (i - (steps - 1) / 2) * pitch;
      const half = f.r(4.2, 8.2) - i * f.r(0.2, 1.6);
      const u = i * shift + f.r(-0.6, 0.6);
      const thick = f.r(0.75, 1.7);
      if (f.chance(0.35)) marks.push(arc(f, u - half, v, u + half, v, u, v + f.r(-1.6, 1.6), thick, 0.5 + i * 0.12));
      else marks.push(seg3(f, u - half, v, u + half, v, thick, 0.5 + i * 0.12));
    }
    const links = f.int(1, 3);
    for (let i = 0; i < links; i += 1) {
      const connector = f.r(-3.5, 3.5);
      marks.push(
        approachPath(
          f,
          connector,
          -((steps - 1) / 2) * pitch - 0.4,
          connector + shift * (steps - 1) + f.r(-1, 1),
          (steps - 1) / 2 * pitch + 0.4,
          f.r(0.7, 1.3),
          f.r(0.35, 0.65)
        )
      );
    }
    return marks;
  }
  function flatDeepPlan(f) {
    const rows = f.int(2, 4);
    const cols = f.int(2, 4);
    const cell = f.r(1.8, 3.2);
    const width = f.r(0.42, 0.95);
    const halfU = (cols - 1) / 2 * cell + cell / 2;
    const halfV = (rows - 1) / 2 * cell + cell / 2;
    const marks = [];
    for (let i = 0; i <= rows; i += 1) {
      const v = -halfV + i * cell;
      marks.push(seg3(f, -halfU, v, halfU, v, width, f.r(0.7, 1.05)));
    }
    for (let i = 0; i <= cols; i += 1) {
      const u = -halfU + i * cell;
      marks.push(seg3(f, u, -halfV, u, halfV, width, f.r(0.7, 1.05)));
    }
    const clusters = f.int(2, 5);
    for (let i = 0; i < clusters; i += 1) {
      marks.push(
        disk2(
          f,
          "point",
          f.r(-halfU + 0.6, halfU - 0.6),
          f.r(-halfV + 0.6, halfV - 0.6),
          f.r(0.55, 1.35),
          f.r(0.55, 1.05)
        )
      );
    }
    return marks;
  }
  function voidEdge(f) {
    const ringR = f.r(2.2, 5.2);
    const edge = f.r(5.4, 7.4);
    const slide = f.r(-3.6, 3.6);
    const marks = [disk2(f, "ring", slide, edge - ringR + f.r(0.4, 1.8), ringR, f.r(0.85, 1.2), true)];
    marks.push(seg3(f, -8, edge + 0.6, 8, edge + 0.6, f.r(0.75, 1.7), f.r(0.4, 0.7)));
    const modules = f.int(2, 5);
    for (let i = 0; i < modules; i += 1) {
      const u = f.r(-6.2, 6.2);
      const v = f.r(-5.4, -0.4);
      marks.push(disk2(f, "point", u, v, f.r(1.1, 2.4), f.r(0.28, 0.55)));
      if (f.chance(0.6)) {
        marks.push(approachPath(f, u, v, slide + f.r(-1.2, 1.2), edge - ringR, f.r(0.5, 1.2), 0.35));
      }
    }
    return marks;
  }
  function undulated(f) {
    const waves = f.int(2, 5);
    const span4 = f.r(12, 16.5);
    const step = span4 / waves;
    const amp = f.r(1.6, 4.6);
    const width = f.r(0.85, 2.2);
    const marks = [];
    for (let i = 0; i < waves; i += 1) {
      const u1 = -span4 / 2 + i * step;
      const u2 = u1 + step;
      marks.push(arc(f, u1, f.r(-1.2, 1.2), u2, f.r(-1.2, 1.2), (u1 + u2) / 2, amp * (i % 2 ? -1 : 1) * f.r(0.6, 1.2), width, f.r(0.35, 0.7)));
    }
    const modules = f.int(4, 8);
    const clusters = [];
    for (let i = 0; i < modules; i += 1) {
      const u = -span4 / 2 + (i + 0.5) / modules * span4 + f.r(-1.2, 1.2);
      const v = (i % 2 ? -1 : 1) * f.r(1.8, 5.2);
      clusters.push({ u, v });
      marks.push(disk2(f, "point", u, v, f.r(1.1, 2.5), f.r(0.45, 0.9)));
    }
    for (let i = 1; i < clusters.length; i += 1) {
      if (!f.chance(0.75)) continue;
      const prev = clusters[i - 1];
      const next = clusters[i];
      marks.push(approachPath(f, prev.u, prev.v, next.u, next.v, f.r(0.5, 1.2), 0.35));
    }
    return marks;
  }
  var GENERATORS = {
    "vertical-void": { angles: ANY, build: verticalVoid },
    "compressed-sequential": { angles: ANY, build: compressedSequential },
    "continuous-hall": { angles: ANY, build: continuousHall },
    "topographic-ground-field": { angles: ANY, build: topographicGroundField },
    "linear-gallery": { angles: ANY, build: linearGallery },
    "open-hall": { angles: ORTHO, build: openHall },
    terraced: { angles: ANY, build: terraced },
    "flat-deep-plan": { angles: ORTHO, build: flatDeepPlan },
    "void-edge": { angles: CARDINAL, build: voidEdge },
    undulated: { angles: ANY, build: undulated }
  };
  function jitteredRecipe(f, recipe) {
    return recipe.map((item) => ({
      ...item,
      x: lim9(item.x + f.r(-1, 1)),
      y: lim9(item.y + f.r(-1, 1)),
      radius: item.radius == null ? void 0 : item.radius * f.r(0.8, 1.25)
    }));
  }
  function runAttractorsFor(archetypeId2, seed, recipe, _kind, attempt = 0, index2 = 0) {
    if (archetypeId2 === "vertical-void") {
      return attractorsFromVerticalVoidPlan(planVerticalVoid(seed, attempt), seed, attempt);
    }
    if (archetypeId2 === "compressed-sequential") {
      return attractorsFromCompressedSequential(planCompressedSequential(seed, attempt, index2), seed, attempt);
    }
    if (archetypeId2 === "continuous-hall") {
      return attractorsFromContinuousHall(planContinuousHall(seed, attempt, index2), seed, attempt);
    }
    if (archetypeId2 === "topographic-ground-field") {
      return attractorsFromTopographic(planTopographicGroundField(seed, attempt, index2), seed, attempt);
    }
    if (archetypeId2 === "linear-gallery") {
      return attractorsFromLinearGallery(planLinearGallery(seed, attempt, index2), seed, attempt);
    }
    if (archetypeId2 === "linear-edge-gallery") {
      return attractorsFromLinearEdgeGallery(planLinearEdgeGallery(seed, attempt, index2));
    }
    if (archetypeId2 === "contained-room-within-volume") {
      return attractorsFromContainedRoom(planContainedRoom(seed, attempt, index2));
    }
    if (archetypeId2 === "inserted-horizontal-plate") {
      return attractorsFromInsertedPlate(planInsertedHorizontalPlate(seed, attempt, index2));
    }
    if (archetypeId2 === "stepped-amphitheater") {
      return attractorsFromSteppedAmphitheater(planSteppedAmphitheater(seed, attempt, index2));
    }
    if (archetypeId2 === "void-field") {
      return attractorsFromVoidField(planVoidField(seed, attempt, index2));
    }
    if (archetypeId2 === "open-hall") {
      return attractorsFromOpenHall(planOpenHall(seed, attempt, index2), seed, attempt);
    }
    const rng = mulberry32(seed ^ 10975943 ^ attempt * 668265261);
    const f = frame8(rng);
    const generator = GENERATORS[archetypeId2];
    if (!generator) return jitteredRecipe(f, recipe);
    return place5(generator.build(f), rng, generator.angles, false);
  }

  // lib/skill1/lobby-realization.ts
  function planLobby(archetypeId2, salt) {
    if (archetypeId2 === "vertical-void") {
      return { archetypeId: archetypeId2, plan: planVerticalVoid(salt.seed, salt.attempt, salt.index) };
    }
    if (archetypeId2 === "compressed-sequential") {
      return { archetypeId: archetypeId2, plan: planCompressedSequential(salt.seed, salt.attempt, salt.index) };
    }
    if (archetypeId2 === "continuous-hall") {
      return { archetypeId: archetypeId2, plan: planContinuousHall(salt.seed, salt.attempt, salt.index) };
    }
    if (archetypeId2 === "topographic-ground-field") {
      return { archetypeId: archetypeId2, plan: planTopographicGroundField(salt.seed, salt.attempt, salt.index) };
    }
    if (archetypeId2 === "linear-gallery") {
      return { archetypeId: archetypeId2, plan: planLinearGallery(salt.seed, salt.attempt, salt.index) };
    }
    return null;
  }
  var finite = (value) => Number.isFinite(value);
  function oneOf(value, legal, field, reasons) {
    if (legal.includes(value)) return true;
    reasons.push(field);
    return false;
  }
  function clampInto(value, band) {
    if (value < band[0]) return band[0];
    if (value > band[1]) return band[1];
    return value;
  }
  function placement(value) {
    if (!finite(value)) return value;
    if (value < 0) return 0;
    if (value > FIELD_SIZE - 1) return FIELD_SIZE - 1;
    return value;
  }
  function repairLobbyPlan(stored) {
    const reasons = [];
    if (stored.archetypeId === "vertical-void") {
      const plan2 = stored.plan;
      if (!oneOf(plan2.core, VERTICAL_VOID_CORES, "core", reasons)) return { ok: false, reasons };
      if (!oneOf(plan2.approach, VERTICAL_VOID_APPROACHES, "approach", reasons)) return { ok: false, reasons };
      if (!oneOf(plan2.relation, VERTICAL_VOID_RELATIONS, "relation", reasons)) return { ok: false, reasons };
      if (![plan2.cx, plan2.cy, plan2.axis, plan2.aspect].every(finite)) return { ok: false, reasons: ["non-finite"] };
      const band = verticalVoidAspectBand(plan2.core);
      const aspect = clampInto(plan2.aspect, band);
      const cx = placement(plan2.cx);
      const cy = placement(plan2.cy);
      const repaired2 = [];
      if (aspect !== plan2.aspect) repaired2.push("aspect");
      if (cx !== plan2.cx) repaired2.push("cx");
      if (cy !== plan2.cy) repaired2.push("cy");
      if (!repaired2.length) return { ok: true, plan: stored, repaired: repaired2 };
      return { ok: true, plan: { archetypeId: stored.archetypeId, plan: { ...plan2, aspect, cx, cy } }, repaired: repaired2 };
    }
    if (stored.archetypeId === "compressed-sequential") {
      const plan2 = stored.plan;
      if (!oneOf(plan2.kind, SEQUENCE_FAMILIES, "kind", reasons)) return { ok: false, reasons };
      if (!oneOf(plan2.growth, GROWTH_MODES, "growth", reasons)) return { ok: false, reasons };
      if (!oneOf(plan2.roomVoice, ROOM_VOICES, "roomVoice", reasons)) return { ok: false, reasons };
      if (!oneOf(plan2.neckVoice, NECK_VOICES, "neckVoice", reasons)) return { ok: false, reasons };
      if (!oneOf(plan2.halo, HALO_VOICES, "halo", reasons)) return { ok: false, reasons };
      if (typeof plan2.flip !== "boolean") return { ok: false, reasons: ["flip"] };
      if (![plan2.scale, plan2.originX, plan2.originY, plan2.twist, plan2.openLo, plan2.openHi].every(finite)) {
        return { ok: false, reasons: ["non-finite"] };
      }
      const attractorsOnly = plan2.halo !== "overgrown";
      const openHi = plan2.openHi > plan2.openLo ? plan2.openHi : plan2.openLo + 0.5;
      const originX2 = placement(plan2.originX);
      const originY2 = placement(plan2.originY);
      const repaired2 = [];
      if (attractorsOnly !== plan2.attractorsOnly) repaired2.push("attractorsOnly");
      if (openHi !== plan2.openHi) repaired2.push("openHi");
      if (originX2 !== plan2.originX) repaired2.push("originX");
      if (originY2 !== plan2.originY) repaired2.push("originY");
      if (!repaired2.length) return { ok: true, plan: stored, repaired: repaired2 };
      return {
        ok: true,
        plan: { archetypeId: stored.archetypeId, plan: { ...plan2, attractorsOnly, openHi, originX: originX2, originY: originY2 } },
        repaired: repaired2
      };
    }
    if (stored.archetypeId === "continuous-hall") {
      const plan2 = stored.plan;
      if (!oneOf(plan2.family, HALL_FAMILIES, "family", reasons)) return { ok: false, reasons };
      if (!oneOf(plan2.growth, HALL_GROWTHS, "growth", reasons)) return { ok: false, reasons };
      if (typeof plan2.flip !== "boolean") return { ok: false, reasons: ["flip"] };
      if (![plan2.cx, plan2.cy, plan2.length, plan2.width, plan2.pinch, plan2.twist].every(finite)) {
        return { ok: false, reasons: ["non-finite"] };
      }
      const figure = figureOf(plan2.family);
      const bands = continuousHallBands(plan2.family, plan2.growth, figure);
      const length = clampInto(plan2.length, bands.length);
      const width = clampInto(plan2.width, bands.width);
      const cx = placement(plan2.cx);
      const cy = placement(plan2.cy);
      const repaired2 = [];
      if (figure !== plan2.figure) repaired2.push("figure");
      if (length !== plan2.length) repaired2.push("length");
      if (width !== plan2.width) repaired2.push("width");
      if (cx !== plan2.cx) repaired2.push("cx");
      if (cy !== plan2.cy) repaired2.push("cy");
      if (!repaired2.length) return { ok: true, plan: stored, repaired: repaired2 };
      return {
        ok: true,
        plan: { archetypeId: stored.archetypeId, plan: { ...plan2, figure, length, width, cx, cy } },
        repaired: repaired2
      };
    }
    if (stored.archetypeId === "topographic-ground-field") {
      const plan2 = stored.plan;
      if (!oneOf(plan2.kind, TERRAIN_FAMILIES, "kind", reasons)) return { ok: false, reasons };
      if (!oneOf(plan2.growth, GROWTH_MODES3, "growth", reasons)) return { ok: false, reasons };
      if (!oneOf(plan2.figure, GROUND_FIGURES, "figure", reasons)) return { ok: false, reasons };
      if (typeof plan2.flip !== "boolean") return { ok: false, reasons: ["flip"] };
      if (![plan2.scale, plan2.originX, plan2.originY, plan2.twist].every(finite)) return { ok: false, reasons: ["non-finite"] };
      const originX2 = placement(plan2.originX);
      const originY2 = placement(plan2.originY);
      const repaired2 = [];
      if (originX2 !== plan2.originX) repaired2.push("originX");
      if (originY2 !== plan2.originY) repaired2.push("originY");
      if (!repaired2.length) return { ok: true, plan: stored, repaired: repaired2 };
      return { ok: true, plan: { archetypeId: stored.archetypeId, plan: { ...plan2, originX: originX2, originY: originY2 } }, repaired: repaired2 };
    }
    const plan = stored.plan;
    if (!oneOf(plan.kind, GALLERY_FAMILIES, "kind", reasons)) return { ok: false, reasons };
    if (!oneOf(plan.growth, GROWTH_MODES2, "growth", reasons)) return { ok: false, reasons };
    if (typeof plan.flip !== "boolean") return { ok: false, reasons: ["flip"] };
    if (![plan.scale, plan.originX, plan.originY, plan.twist].every(finite)) return { ok: false, reasons: ["non-finite"] };
    const originX = placement(plan.originX);
    const originY = placement(plan.originY);
    const repaired = [];
    if (originX !== plan.originX) repaired.push("originX");
    if (originY !== plan.originY) repaired.push("originY");
    if (!repaired.length) return { ok: true, plan: stored, repaired };
    return { ok: true, plan: { archetypeId: stored.archetypeId, plan: { ...plan, originX, originY } }, repaired };
  }
  function translationFromRun(base2, salt) {
    const attractors = runAttractorsFor(base2.archetypeId, salt.seed, base2.recipe.attractors ?? [], void 0, salt.attempt, salt.index);
    const first = attractors[0] ?? { x: 10, y: 10, kind: "point", radius: 1.4, strength: 1 };
    return {
      ...base2,
      recipe: {
        ...base2.recipe,
        attractorFixed: true,
        attractorsOnly: true,
        attractor: { x: first.x, y: first.y },
        attractors
      }
    };
  }
  function pinIndex(plan, salt) {
    return plan.index === salt.index ? plan : { ...plan, index: salt.index };
  }
  function lobbySimulationSlime(archetypeId2, slime) {
    if (archetypeId2 === "continuous-hall" || archetypeId2 === "compressed-sequential" || archetypeId2 === "topographic-ground-field" || archetypeId2 === "linear-gallery") {
      return slime;
    }
    return { ...slime, diffusion: Math.min(slime.diffusion, 0.04) };
  }
  function clampAgents(value) {
    return Math.round(Math.min(600, Math.max(MIN_AGENT_COUNT, value)));
  }
  function realizeLobbyPlan(base2, slimeBase2, stored, salt) {
    if (stored.archetypeId !== base2.archetypeId) return { ok: false, reasons: ["archetype"] };
    if (![salt.seed, salt.attempt, salt.index].every(finite)) return { ok: false, reasons: ["salt"] };
    const repaired = repairLobbyPlan(stored);
    if (!repaired.ok) return repaired;
    const { seed, attempt } = salt;
    const slimeSalt = seed ^ attempt * 131;
    const agentSalt = seed ^ attempt;
    if (repaired.plan.archetypeId === "vertical-void") {
      const plan2 = repaired.plan.plan;
      const marks2 = attractorsFromVerticalVoidPlan(plan2, seed, attempt);
      const first = marks2[0] ?? { x: plan2.cx, y: plan2.cy, kind: "ring", radius: 1.4, strength: 1 };
      const translation2 = {
        ...base2,
        recipe: {
          ...base2.recipe,
          attractorFixed: true,
          attractorsOnly: true,
          attractor: { x: first.x, y: first.y },
          attractors: marks2
        }
      };
      const slime2 = {
        ...slimeFromVerticalVoidPlan(slimeBase2, plan2, slimeSalt),
        foodPoints: []
      };
      const rng = mulberry32(seed ^ 1831565813 ^ attempt);
      const agents2 = clampAgents(agentCountFromDensity(densityFromTranslation(base2)) + (rng() - 0.5) * 36);
      return pack2(repaired.plan, salt, repaired.repaired, agents2, slime2, translation2);
    }
    const runTranslation = translationFromRun(base2, salt);
    if (repaired.plan.archetypeId === "compressed-sequential") {
      const plan2 = pinIndex(repaired.plan.plan, salt);
      const nextPlan2 = plan2 === repaired.plan.plan ? repaired.plan : { archetypeId: "compressed-sequential", plan: plan2 };
      const marks2 = attractorsFromCompressedSequential(plan2, seed, attempt);
      const translation2 = {
        ...runTranslation,
        params: paramsFromCompressedSequential(base2.params, plan2),
        recipe: {
          ...recipeFromCompressedSequential(runTranslation.recipe, plan2, slimeSalt),
          attractors: marks2,
          attractorFixed: true,
          attractorsOnly: plan2.attractorsOnly
        }
      };
      const slime2 = {
        ...slimeFromCompressedSequential(slimeBase2, plan2, slimeSalt),
        foodPoints: foodFromAttractors(marks2)
      };
      const agents2 = clampAgents(agentsFromCompressedSequential(plan2, agentSalt));
      return pack2(nextPlan2, salt, repaired.repaired, agents2, slime2, translation2);
    }
    if (repaired.plan.archetypeId === "continuous-hall") {
      const plan2 = pinIndex(repaired.plan.plan, salt);
      const nextPlan2 = plan2 === repaired.plan.plan ? repaired.plan : { archetypeId: "continuous-hall", plan: plan2 };
      const marks2 = attractorsFromContinuousHall(plan2, seed, attempt);
      const translation2 = {
        ...runTranslation,
        topology: "open-network",
        params: paramsFromContinuousHall(base2.params, plan2),
        recipe: {
          ...recipeFromContinuousHall(runTranslation.recipe, plan2, slimeSalt),
          attractors: marks2
        }
      };
      const slime2 = {
        ...slimeFromContinuousHall(slimeBase2, plan2, slimeSalt),
        foodPoints: []
      };
      const agents2 = clampAgents(agentsFromContinuousHall(plan2, agentSalt));
      return pack2(nextPlan2, salt, repaired.repaired, agents2, slime2, translation2);
    }
    if (repaired.plan.archetypeId === "topographic-ground-field") {
      const plan2 = pinIndex(repaired.plan.plan, salt);
      const nextPlan2 = plan2 === repaired.plan.plan ? repaired.plan : { archetypeId: "topographic-ground-field", plan: plan2 };
      const marks2 = attractorsFromTopographic(plan2, seed, attempt);
      const translation2 = {
        ...runTranslation,
        params: paramsFromTopographic(base2.params, slimeSalt),
        recipe: {
          ...recipeFromTopographic(runTranslation.recipe, slimeSalt),
          attractors: marks2,
          attractorFixed: true,
          attractorsOnly: true
        }
      };
      const slime2 = {
        ...slimeFromTopographic(slimeBase2, plan2, slimeSalt),
        foodPoints: []
      };
      const agents2 = clampAgents(agentsFromTopographic(plan2, agentSalt));
      return pack2(nextPlan2, salt, repaired.repaired, agents2, slime2, translation2);
    }
    const plan = pinIndex(repaired.plan.plan, salt);
    const nextPlan = plan === repaired.plan.plan ? repaired.plan : { archetypeId: "linear-gallery", plan };
    const marks = attractorsFromLinearGallery(plan, seed, attempt);
    const translation = {
      ...runTranslation,
      params: paramsFromLinearGallery(base2.params, slimeSalt),
      recipe: {
        ...recipeFromLinearGallery(runTranslation.recipe, slimeSalt),
        attractors: marks,
        attractorFixed: true,
        attractorsOnly: true
      }
    };
    const slime = {
      ...slimeFromLinearGallery(slimeBase2, plan, slimeSalt),
      foodPoints: []
    };
    const agents = clampAgents(agentsFromLinearGallery(plan, agentSalt));
    return pack2(nextPlan, salt, repaired.repaired, agents, slime, translation);
  }
  function pack2(plan, salt, repaired, agents, slime, translation) {
    return {
      ok: true,
      plan,
      salt,
      agents,
      slime,
      simulationSlime: lobbySimulationSlime(plan.archetypeId, slime),
      translation,
      attractors: translation.recipe.attractors ?? [],
      foodPoints: slime.foodPoints,
      repaired
    };
  }

  // components/skill1-viz.tsx
  var import_react = __toESM(require_react());

  // lib/render/slime-field-gl.ts
  var VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  var FRAG = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform float uTexels;
uniform float uCutoff;
uniform int uCount;
uniform vec4 uAttr[16];
uniform float uKind[16];
in vec2 vUv;
out vec4 oColor;

float tap(vec2 st) {
  return texture(uField, clamp(st, 0.0, 1.0)).r;
}

float bspline0(float t) { return (1.0 - t) * (1.0 - t) * (1.0 - t) / 6.0; }
float bspline1(float t) { return (3.0 * t * t * t - 6.0 * t * t + 4.0) / 6.0; }
float bspline2(float t) { return (-3.0 * t * t * t + 3.0 * t * t + 3.0 * t + 1.0) / 6.0; }
float bspline3(float t) { return t * t * t / 6.0; }

float fieldAt(vec2 uv) {
  vec2 p = clamp(uv, 0.0, 1.0) * uTexels - 0.5;
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 d = vec2(1.0) / uTexels;
  float wx[4];
  wx[0] = bspline0(f.x);
  wx[1] = bspline1(f.x);
  wx[2] = bspline2(f.x);
  wx[3] = bspline3(f.x);
  float wy[4];
  wy[0] = bspline0(f.y);
  wy[1] = bspline1(f.y);
  wy[2] = bspline2(f.y);
  wy[3] = bspline3(f.y);
  float acc = 0.0;
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      acc += tap((i + vec2(float(x - 1), float(y - 1)) + 0.5) * d) * wx[x] * wy[y];
    }
  }
  return max(0.0, acc);
}

float distToSeg(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float den = dot(ab, ab);
  float t = den > 0.000001 ? clamp(dot(p - a, ab) / den, 0.0, 1.0) : 0.0;
  return length(p - (a + ab * t));
}

float attractorNear(vec2 uv) {
  if (uCount <= 0) return 0.0;
  float best = 1.0;
  for (int i = 0; i < 16; i++) {
    if (i >= uCount) break;
    vec4 a = uAttr[i];
    float kind = uKind[i];
    float d = distance(uv, a.xy);
    if (kind > 1.5) d = distToSeg(uv, a.xy, a.zw);
    else if (kind > 0.5) d = abs(distance(uv, a.xy) - a.z);
    best = min(best, d);
  }
  return 1.0 - smoothstep(0.0, 0.16, best);
}

void main() {
  float t = 1.0 / uTexels;
  float v = fieldAt(vUv);
  float e = fieldAt(vUv + vec2(t, 0.0));
  float w = fieldAt(vUv - vec2(t, 0.0));
  float n = fieldAt(vUv + vec2(0.0, t));
  float s = fieldAt(vUv - vec2(0.0, t));
  float ne = fieldAt(vUv + vec2(t, t));
  float nw = fieldAt(vUv + vec2(-t, t));
  float se = fieldAt(vUv + vec2(t, -t));
  float sw = fieldAt(vUv + vec2(-t, -t));
  float around = 0.125 * (e + w + n + s + ne + nw + se + sw);
  float ridge = max(0.0, v - around * 0.62);
  vec2 g = vec2(e - w, n - s);
  float glen = length(g);
  vec2 along = glen > 1.0e-6 ? vec2(-g.y, g.x) / glen : vec2(1.0, 0.0);
  float tissue = v;
  if (v > 0.04 || ridge > 0.005) {
    float linked = v;
    for (int i = 1; i <= 8; i++) {
      float step = float(i) * t * 1.6;
      linked = max(linked, fieldAt(vUv + along * step));
      linked = max(linked, fieldAt(vUv - along * step));
    }
    tissue = max(v, linked * 0.96);
  }

  float membrane = smoothstep(0.14, 0.28, tissue);
  float tube = smoothstep(0.045, 0.12, tissue) * smoothstep(0.004, 0.016, ridge);
  float hair = smoothstep(0.018, 0.04, tissue) * smoothstep(0.008, 0.02, ridge);
  float mask = max(membrane, max(tube, hair));
  if (mask < 0.02) {
    oColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  float aa = max(fwidth(mask), 0.008);
  float cover = smoothstep(0.22 - aa, 0.22 + aa, mask);
  if (cover < 0.03) {
    oColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  float body = clamp(tissue, 0.0, 1.0);
  float depth = pow(body, 0.68);
  float membraneTone = 0.88 + 0.12 * smoothstep(0.0, 0.08, ridge);
  float anchor = attractorNear(vUv);
  vec3 search = vec3(1.0, 1.0, 1.0);
  vec3 vein = vec3(0.780, 0.494, 0.373);
  vec3 organized = vec3(0.059, 0.451, 0.467);
  vec3 ink = mix(search, vein, smoothstep(0.08, 0.34, body));
  float core = max(anchor * smoothstep(0.08, 0.32, body), smoothstep(0.48, 0.82, body));
  ink = mix(ink, organized, core * mix(0.35, 0.72, body));
  ink *= depth * membraneTone;
  oColor = vec4(ink * cover, 1.0);
}`;
  var state = null;
  var failed = false;
  var SHADER_GEN = 28;
  var builtGen = -1;
  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }
  function createState() {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      depth: false,
      stencil: false
    });
    if (!gl) return null;
    const vert = compile(gl, gl.VERTEX_SHADER, VERT);
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vert || !frag) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    const uTexels = gl.getUniformLocation(program, "uTexels");
    const uCutoff = gl.getUniformLocation(program, "uCutoff");
    const uCount = gl.getUniformLocation(program, "uCount");
    const uAttr = gl.getUniformLocation(program, "uAttr");
    const uKind = gl.getUniformLocation(program, "uKind");
    if (!buffer || !texture || !uTexels || !uCutoff || !uCount || !uAttr || !uKind) return null;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    return {
      canvas,
      gl,
      program,
      texture,
      buffer,
      uTexels,
      uCutoff,
      uCount,
      uAttr,
      uKind,
      pixels: new Float32Array(0)
    };
  }
  function ensure() {
    if (failed && builtGen === SHADER_GEN) return null;
    if (state && !state.gl.isContextLost() && builtGen === SHADER_GEN) return state;
    state = createState();
    builtGen = SHADER_GEN;
    if (!state) failed = true;
    else failed = false;
    return state;
  }
  function drawSlimeFieldGl(ctx, trails, trailSize, peak, fieldW, fieldH, cutoff, attractors) {
    const gpu = ensure();
    if (!gpu) return false;
    const { gl, canvas } = gpu;
    const dpr = Math.max(1, ctx.getTransform().a || (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1);
    const pixels = Math.max(256, Math.min(8192, Math.round(Math.max(fieldW, fieldH) * dpr * 2)));
    if (canvas.width !== pixels || canvas.height !== pixels) {
      canvas.width = pixels;
      canvas.height = pixels;
    }
    const count = trailSize * trailSize;
    if (gpu.pixels.length !== count) gpu.pixels = new Float32Array(count);
    const inv = 1 / Math.max(peak, 1e-4);
    for (let i = 0; i < count; i += 1) gpu.pixels[i] = Math.pow(Math.max(0, trails[i] * inv), 0.82);
    gl.viewport(0, 0, pixels, pixels);
    gl.useProgram(gpu.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gpu.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gpu.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, trailSize, trailSize, 0, gl.RED, gl.FLOAT, gpu.pixels);
    gl.uniform1i(gl.getUniformLocation(gpu.program, "uField"), 0);
    gl.uniform1f(gpu.uTexels, trailSize);
    gl.uniform1f(gpu.uCutoff, cutoff);
    const packed = new Float32Array(64);
    const kinds = new Float32Array(16);
    const list = attractors ?? [];
    const attractorCount = Math.min(16, list.length);
    for (let i = 0; i < attractorCount; i += 1) {
      const item = list[i];
      const x = item.x / FIELD_SIZE;
      const y = item.y / FIELD_SIZE;
      if (item.kind === "line" || item.kind === "curve") {
        packed.set([x, y, (item.x2 ?? item.x) / FIELD_SIZE, (item.y2 ?? item.y) / FIELD_SIZE], i * 4);
        kinds[i] = 2;
      } else if (item.kind === "ring") {
        packed.set([x, y, (item.radius ?? 4) / FIELD_SIZE, 0], i * 4);
        kinds[i] = 1;
      } else {
        packed.set([x, y, 0, 0], i * 4);
      }
    }
    gl.uniform1i(gpu.uCount, attractorCount);
    gl.uniform4fv(gpu.uAttr, packed);
    gl.uniform1fv(gpu.uKind, kinds);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, 0, 0, fieldW, fieldH);
    ctx.restore();
    return true;
  }

  // components/skill1-viz.tsx
  var import_jsx_runtime = __toESM(require_jsx_runtime());
  function toCanvas(y, height, scale) {
    return height - y * scale;
  }
  function drawPlanField(ctx, snapshot, width, height, options) {
    ctx.clearRect(0, 0, width, height);
    const scale = Math.min(width, height) / FIELD_SIZE;
    const fieldW = width;
    const fieldH = height;
    const ox = 0;
    const oy = 0;
    const fine = options?.fine !== false;
    const density = options?.density ?? 5;
    ctx.save();
    ctx.translate(ox, oy);
    if (snapshot) {
      let peak = 1e-4;
      for (const value of snapshot.trails) if (value > peak) peak = value;
      const colorMarks = options?.attractors?.length ? options.attractors : [{ kind: "point", x: snapshot.attractor.x, y: snapshot.attractor.y, radius: 1.6 }];
      drawColonyBody(ctx, snapshot, peak, fieldW, fieldH, fine, density, colorMarks);
      const sx = snapshot.source.x * scale;
      const sy = toCanvas(snapshot.source.y, fieldH, scale);
      ctx.strokeStyle = "rgba(15, 115, 119, 0.85)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(15, 115, 119, 0.28)";
      ctx.beginPath();
      ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    const marks = options?.attractors;
    if (options?.showAttractors !== false) {
      if (marks?.length) {
        const unit = Math.min(fieldW, fieldH) / FIELD_SIZE;
        const at2 = (x, y) => ({
          px: x / FIELD_SIZE * fieldW,
          py: fieldH - y / FIELD_SIZE * fieldH
        });
        ctx.strokeStyle = "#ffffff";
        ctx.fillStyle = "#ffffff";
        ctx.lineWidth = 1.25;
        marks.forEach((item, index2) => {
          const selected = options?.selectedIndices?.includes(index2) || options?.selectedIndex === index2;
          const center = at2(item.x, item.y);
          const ringRadius = item.kind === "ring" ? Math.max(2, (item.radius ?? 4) * unit) : Math.max(2, (item.radius ?? 1.6) * unit);
          if (selected) {
            const gradient = ctx.createLinearGradient(center.px - ringRadius, center.py, center.px + ringRadius, center.py);
            gradient.addColorStop(0, "#0f7377");
            gradient.addColorStop(0.52, "#8faaa8");
            gradient.addColorStop(1, "#c77e5f");
            ctx.strokeStyle = gradient;
            ctx.fillStyle = gradient;
            ctx.lineWidth = 4;
          } else {
            ctx.strokeStyle = "#ffffff";
            ctx.fillStyle = "#ffffff";
            ctx.lineWidth = 1.25;
          }
          if (item.kind === "line" || item.kind === "curve") {
            const end = at2(item.x2 ?? item.x + 3, item.y2 ?? item.y);
            ctx.beginPath();
            ctx.moveTo(center.px, center.py);
            if (item.kind === "curve") {
              const bend = at2(item.cx ?? (item.x + (item.x2 ?? item.x + 3)) / 2, item.cy ?? (item.y + (item.y2 ?? item.y)) / 2 + 1.6);
              ctx.quadraticCurveTo(bend.px, bend.py, end.px, end.py);
            } else {
              ctx.lineTo(end.px, end.py);
            }
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(center.px, center.py, 2.2, 0, Math.PI * 2);
            ctx.arc(end.px, end.py, 2.2, 0, Math.PI * 2);
            if (item.kind === "curve") {
              const bend = at2(item.cx ?? (item.x + (item.x2 ?? item.x + 3)) / 2, item.cy ?? (item.y + (item.y2 ?? item.y)) / 2 + 1.6);
              ctx.moveTo(bend.px + 3.2, bend.py);
              ctx.arc(bend.px, bend.py, 3.2, 0, Math.PI * 2);
            }
            ctx.fill();
          } else if (item.kind === "ring") {
            ctx.beginPath();
            ctx.arc(center.px, center.py, Math.max(2, (item.radius ?? 4) * unit), 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(center.px, center.py, 2.2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            const radius = Math.max(2, (item.radius ?? 1.6) * unit);
            ctx.beginPath();
            ctx.arc(center.px, center.py, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(center.px, center.py, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      } else if (snapshot) {
        const ax = snapshot.attractor.x * scale;
        const ay = toCanvas(snapshot.attractor.y, fieldH, scale);
        ctx.fillStyle = "rgba(199, 126, 95, 0.7)";
        ctx.beginPath();
        ctx.arc(ax, ay, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    if (options?.showHud) {
      ctx.fillStyle = "rgba(150,184,196,0.8)";
      ctx.font = "500 10px Rajdhani, sans-serif";
      ctx.fillText(`${FIELD_SIZE} \xD7 ${FIELD_SIZE} FIELD`, 10, height - 10);
    }
  }
  function bilerp(field, ts, x, y) {
    const x0 = Math.max(0, Math.min(ts - 1, Math.floor(x)));
    const y0 = Math.max(0, Math.min(ts - 1, Math.floor(y)));
    const x1 = Math.min(ts - 1, x0 + 1);
    const y1 = Math.min(ts - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const a = field[y0 * ts + x0];
    const b = field[y0 * ts + x1];
    const c = field[y1 * ts + x0];
    const d = field[y1 * ts + x1];
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }
  var fineScratch = null;
  var coarseScratch = null;
  var fineCacheKey = "";
  var coarseCacheKey = "";
  var nCache = null;
  function fillTrailCaches(trails, ts, peak) {
    const count = ts * ts;
    if (!nCache || nCache.length !== count) {
      nCache = new Float32Array(count);
    }
    for (let y = 0; y < ts; y += 1) {
      const row = y * ts;
      for (let x = 0; x < ts; x += 1) {
        nCache[row + x] = Math.pow(Math.max(0, trails[row + x] / peak), 0.82);
      }
    }
  }
  function drawColonyBody(ctx, snapshot, peak, fieldW, fieldH, fine, density, attractors) {
    const cutoff = trailMaskCutoff(density);
    if (drawSlimeFieldGl(ctx, snapshot.trails, snapshot.trailSize, peak, fieldW, fieldH, cutoff, attractors)) return;
    const dpr = ctx.getTransform().a || 1;
    const res = fine ? Math.max(4096, Math.min(8192, Math.round(fieldH * Math.max(dpr, 1) * 2))) : Math.max(160, Math.min(280, Math.round(fieldH)));
    let finger = 0;
    const stride = Math.max(1, Math.floor(snapshot.trails.length / 64));
    for (let i = 0; i < snapshot.trails.length; i += stride) finger = finger + Math.round(snapshot.trails[i] * 1e3) | 0;
    const cacheKey = `${finger}:${snapshot.iteration}:${snapshot.trailSize}:${res}:${peak.toFixed(5)}:${cutoff.toFixed(3)}:vessel:${attractors?.length ?? 0}`;
    let scratch = fine ? fineScratch : coarseScratch;
    if (!scratch) {
      scratch = document.createElement("canvas");
      if (fine) fineScratch = scratch;
      else coarseScratch = scratch;
    }
    if (scratch.width !== res || scratch.height !== res) {
      scratch.width = res;
      scratch.height = res;
      if (fine) fineCacheKey = "";
      else coarseCacheKey = "";
    }
    const hit = fine ? fineCacheKey === cacheKey : coarseCacheKey === cacheKey;
    if (!hit) {
      const off = scratch.getContext("2d");
      if (!off) return;
      const image = off.createImageData(res, res);
      const data = image.data;
      const ts = snapshot.trailSize;
      fillTrailCaches(snapshot.trails, ts, peak);
      const nField = nCache;
      if (!nField) return;
      const last = res - 1;
      for (let py = 0; py < res; py += 1) {
        const fy = (1 - py / last) * FIELD_SIZE;
        for (let px = 0; px < res; px += 1) {
          const fx = px / last * FIELD_SIZE;
          const scale = ts / FIELD_SIZE;
          const tx = fx * scale;
          const ty = fy * scale;
          const v = bilerp(nField, ts, tx, ty);
          const e = bilerp(nField, ts, tx + 1, ty);
          const w = bilerp(nField, ts, tx - 1, ty);
          const n = bilerp(nField, ts, tx, ty + 1);
          const s = bilerp(nField, ts, tx, ty - 1);
          const around = 0.25 * (e + w + n + s);
          const ridge = Math.max(0, v - around * 0.62);
          const gx = e - w;
          const gy = n - s;
          const glen = Math.hypot(gx, gy);
          const ax = glen > 1e-6 ? -gy / glen : 1;
          const ay = glen > 1e-6 ? gx / glen : 0;
          let tissue = v;
          if (v > 0.04 || ridge > 5e-3) {
            let linked = v;
            for (let k = 1; k <= 6; k += 1) {
              linked = Math.max(
                linked,
                bilerp(nField, ts, tx + ax * k * 1.6, ty + ay * k * 1.6),
                bilerp(nField, ts, tx - ax * k * 1.6, ty - ay * k * 1.6)
              );
            }
            tissue = Math.max(v, linked * 0.96);
          }
          const membrane = Math.min(1, Math.max(0, (tissue - 0.14) / 0.14));
          const tube = Math.min(1, Math.max(0, (tissue - 0.045) / 0.075)) * Math.min(1, Math.max(0, (ridge - 4e-3) / 0.012));
          const hair = Math.min(1, Math.max(0, (tissue - 0.018) / 0.022)) * Math.min(1, Math.max(0, (ridge - 8e-3) / 0.012));
          const mask = Math.max(membrane, tube, hair);
          if (mask < 0.03) {
            const empty = (py * res + px) * 4;
            data[empty + 3] = 255;
            continue;
          }
          const body = Math.min(1, tissue);
          const alpha = mask;
          const vein2 = Math.min(1, Math.max(0, (body - 0.08) / 0.26));
          let pull = 0;
          if (attractors?.length) {
            let nearest = 1;
            for (const mark of attractors) {
              const dx = fx / FIELD_SIZE - mark.x / FIELD_SIZE;
              const dy = fy / FIELD_SIZE - mark.y / FIELD_SIZE;
              let d = Math.hypot(dx, dy);
              if (mark.kind === "ring") d = Math.abs(d - (mark.radius ?? 4) / FIELD_SIZE);
              nearest = Math.min(nearest, d);
            }
            pull = nearest >= 0.16 ? 0 : 1 - nearest / 0.16;
          }
          const core = Math.max(
            pull * Math.min(1, Math.max(0, (body - 0.08) / 0.24)),
            Math.min(1, Math.max(0, (body - 0.48) / 0.34))
          );
          const mixCore = core * (0.35 + body * 0.37);
          const r = ((1 * (1 - vein2) + 0.78 * vein2) * (1 - mixCore) + 0.059 * mixCore) * alpha;
          const g = ((1 * (1 - vein2) + 0.494 * vein2) * (1 - mixCore) + 0.451 * mixCore) * alpha;
          const b = ((1 * (1 - vein2) + 0.373 * vein2) * (1 - mixCore) + 0.467 * mixCore) * alpha;
          const i = (py * res + px) * 4;
          data[i] = Math.round(Math.min(1, r) * 255);
          data[i + 1] = Math.round(Math.min(1, g) * 255);
          data[i + 2] = Math.round(Math.min(1, b) * 255);
          data[i + 3] = 255;
        }
      }
      off.putImageData(image, 0, 0);
      if (fine) fineCacheKey = cacheKey;
      else coarseCacheKey = cacheKey;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(scratch, 0, 0, fieldW, fieldH);
  }

  // scripts/lobby-catalog-browser.ts
  var RUN_COUNT = 100;
  var RUN_TRAIL_SCALE = 8;
  var IMAGE_SIZE = 1280;
  var ATTEMPTS = 6;
  var archetypeId = "";
  var index = 0;
  var savedAt = 0;
  var previous = [];
  var previousHall = [];
  var base = null;
  var slimeBase = null;
  function seedFor(id, run) {
    return (334865 ^ run * 9973 ^ id.length * 131) >>> 0;
  }
  function kindLabel(marks) {
    if (!marks?.length) return "mixed";
    const kinds = [...new Set(marks.map((mark) => mark.kind))];
    if (kinds.length === 1) {
      const kind = kinds[0];
      return kind === "ring" ? "circle" : kind === "curve" ? "curvy line" : kind;
    }
    return "mixed";
  }
  function realizeRun(translation, slime, seed, attempt, cell) {
    const salt = { seed, attempt, index: cell };
    const planned = planLobby(translation.archetypeId, salt);
    if (!planned) throw new Error(`${translation.archetypeId} has no lobby plan`);
    const realized = realizeLobbyPlan(translation, slime, planned, salt);
    if (!realized.ok) throw new Error(`${translation.archetypeId}: ${realized.reasons.join(", ")}`);
    return {
      seed,
      agents: realized.agents,
      slime: realized.slime,
      translation: realized.translation,
      lobbyPlan: realized.plan,
      lobbySalt: realized.salt
    };
  }
  function simulate(variant) {
    const next = createSimulation(variant.translation, variant.seed, variant.agents, RUN_TRAIL_SCALE);
    next.maxIterations = DISPLAY_ITERATIONS;
    const rng = mulberry32(variant.seed ^ 2654435769);
    const slime = lobbySimulationSlime(variant.translation.archetypeId, variant.slime);
    stepMany(next, variant.translation, rng, DISPLAY_ITERATIONS, slime.decay, slime, false);
    return captureSnapshot(next, true);
  }
  function paint(snapshot, attractors) {
    const canvas = document.createElement("canvas");
    canvas.width = IMAGE_SIZE;
    canvas.height = IMAGE_SIZE;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("no 2d context");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
    drawPlanField(ctx, snapshot, IMAGE_SIZE, IMAGE_SIZE, {
      showHud: false,
      fine: true,
      density: 5,
      attractors,
      showAttractors: false
    });
    return canvas.toDataURL("image/png");
  }
  function choose(tries, hall) {
    for (const item of tries) {
      if (!item.identity) continue;
      if (hall ? !isNovelHall(item.signature, previousHall) : !isNovelMorphology(item.features, previous)) continue;
      return item;
    }
    const valid = tries.filter((item) => item.identity);
    const pool = valid.length ? valid : tries;
    return pool[pickMostNovel(pool.map((item) => item.features), previous)] ?? tries[tries.length - 1];
  }
  function resetCatalog(id, stamp, startIndex = 0, keptFeatures = [], keptHall = []) {
    archetypeId = id;
    index = startIndex;
    savedAt = stamp;
    previous = keptFeatures;
    previousHall = keptHall;
    base = translateArchetype(id);
    slimeBase = slimeControlsFromTranslation(base);
    return { archetypeId, index, count: RUN_COUNT };
  }
  function publishCell() {
    if (!base || !slimeBase) throw new Error("catalog was not reset");
    if (index >= RUN_COUNT) return null;
    const cell = index;
    const seed = seedFor(archetypeId, cell);
    const hall = archetypeId === "continuous-hall";
    const tries = [];
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const variant = realizeRun(base, slimeBase, seed, attempt, cell);
      const snapshot = simulate(variant);
      const marks2 = variant.translation.recipe.attractors ?? [];
      const features = extractMorphFeatures(snapshot, marks2);
      const identity = hall ? continuousHallIdentity(features, marks2, snapshot) : verticalVoidIdentity(features);
      const signature = hall ? hallSignature(marks2, { slime: variant.slime, agents: variant.agents }) : [];
      tries.push({ variant, snapshot, features, identity, signature });
    }
    const chosen = choose(tries, hall);
    if (!chosen) throw new Error(`${archetypeId} cell ${cell} produced no attempt`);
    previous.push(chosen.features);
    if (chosen.signature.length) previousHall.push(chosen.signature);
    const marks = chosen.variant.translation.recipe.attractors;
    const png = paint(chosen.snapshot, marks);
    index += 1;
    const { snapshot: _snapshot, ...rest } = chosen;
    return {
      png,
      state: {
        index,
        features: previous,
        hall: previousHall
      },
      entry: {
        id: `${archetypeId}-${seed}-${cell}-${savedAt}`,
        archetypeId,
        archetypeName: chosen.variant.translation.archetypeName,
        run: cell + 1,
        seed,
        kind: kindLabel(marks),
        agents: chosen.variant.agents,
        iterations: chosen.snapshot.iteration ?? DISPLAY_ITERATIONS,
        savedAt,
        slime: chosen.variant.slime,
        params: chosen.variant.translation.params,
        behavior: chosen.variant.translation.behavior,
        recipe: chosen.variant.translation.recipe,
        topology: chosen.variant.translation.topology,
        lobbyPlan: chosen.variant.lobbyPlan,
        lobbySalt: chosen.variant.lobbySalt,
        identity: rest.identity,
        attempt: chosen.variant.lobbySalt?.attempt ?? 0
      }
    };
  }
  window.resetCatalog = resetCatalog;
  window.publishCell = publishCell;
})();
/*! Bundled license information:

react/cjs/react.development.js:
  (**
   * @license React
   * react.development.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react-jsx-runtime.development.js:
  (**
   * @license React
   * react-jsx-runtime.development.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
