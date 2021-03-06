'use strict';

var assert = require('assert');
var path = require('path');

var _ = require('lodash');

var extensionsCodegen = require('../../../lib/codegen/extensions');
var generics = require('../../../scripts/_generics');

var extensionMockLocation = path.join(__dirname, "../../../lib/mocks/extensions/");
var extensionLocation = path.join(extensionMockLocation, "demo/commands/test.js");
var extensionContent = "'use strict';\n\nfunction command(flag, parameters) {\n    console.log(\"Hello world\");\n}\n\nmodule.exports = {\n    exec: command,\n    command: \"test\",\n    native: null, // require('_utils').exec('command');\n    help: 'Description:\\n- Executes Test\\n\\nUsage:\\n- Test',\n};";
var codegen = "function(){\nGame.extensions = AI.extensions = {\ncommands: {\ntest: (function(){\nvar module = {};(function(){\n\'use strict\';\n\nfunction command(flag, parameters) {\n    console.log(\"Hello world\");\n}\n\nmodule.exports = {\n    exec: command,\n    command: \"test\",\n    native: null, \/\/ require(\'_utils\').exec(\'command\');\n    help: \'Description:\\n- Executes Test\\n\\nUsage:\\n- Test\',\n};\n}());\n\nreturn module.exports;\n}()),\n},\n};\n}";

describe('CodeGen: extensions', function() {
    describe('check', function() {
        it('Should not give warnings if there are no conflicts', function() {
            assert.deepEqual(
                extensionsCodegen.test.check(
                    [
                        {foo: 'bar'},
                        {foobar: 'baz'}
                    ],
                    ['a', 'b']
                ),
                []
            );
        });

        it('Should warn about merge conflicts in trees', function() {
            assert.deepEqual(
                extensionsCodegen.test.check(
                    [
                        {foo: 'bar', hello: "world"},
                        {foo: 'baz'},
                        {}
                    ], ['a', 'b', 'c']
                ),
                [
                    {
                        error: "Found foo in a and b, picking content from b",
                        type: "Conflict",
                        path: ["foo"],
                        origins: ["a", "b"]
                    }
                ]
            );
        });

        it('Should warn about merge conflicts in deep trees', function() {
            assert.deepEqual(
                extensionsCodegen.test.check(
                    [
                        {foo: {foobar: 'bar'}},
                        {foo: {foobar: 'baz'}},
                        {foo: {hello: "world"}},
                        {hello: "world"}
                    ], ['a', 'b', 'c', 'd']
                ), [
                    {
                        error: "Found foo.foobar in a and b, picking content from b",
                        type: "Conflict",
                        path: ["foo", "foobar"],
                        origins: ["a", "b"]
                    }
                ]
            );
        });
        it('Should warn about invalid object in trees', function() {
            assert.deepEqual(
                extensionsCodegen.test.check(
                    [
                        {foo: {foobar: 'bar'}},
                        {foo: {hello: "world"}},
                        {hello: "world"},
                        {'a': 0}
                    ], ['a', 'b', 'c', 'd']
                ), [
                    {
                        error: "Found invalid type for a",
                        type: "Unexpected type",
                        path: ["a"]
                    }
                ]
            );
        });
    });

    describe('extensionIterator', function() {
        var testObject = {
            foo: {
                bar: 'a',
                bazBar: {fooBar: 'e'}
            },
            baz: 'b',
            foobar: 'c',
            bazBar: {foo: {bar: "d"}}
        };

        it('Should list all items in the extension object', function() {
            var result = {};
            extensionsCodegen.test.extensionIterator(
                function(content, path) {
                    result[content] = path;
                },
                testObject
            );

            assert.deepEqual(result, {
                a: ['foo', 'bar'],
                b: ['baz'],
                c: ['foobar'],
                d: ['bazBar', 'foo', 'bar'],
                e: ['foo', 'bazBar', 'fooBar']
            });
        });

        it('Should be able to iterate in a sub path alone', function() {
            var result = {};
            extensionsCodegen.test.extensionIterator(
                function(content, path) {
                    result[content] = path;
                },
                testObject.foo,
                ['foo']
            );

            assert.deepEqual(result, {
                a: ['foo', 'bar'],
                e: ['foo', 'bazBar', 'fooBar']
            });
        });

        it('Should thrown an error if the object contains invalid items', function() {
            var hasInvalidObject = function() {
                extensionsCodegen.test.extensionIterator(
                    function(){},
                    {foo: {bar: 0}}
                );
            };

            var errorValidator = function(e) {
                return e instanceof Error &&
                    e.message === "Invalid type at foo.bar";
            };

            assert.throws(hasInvalidObject, errorValidator);
        });

        it('Should pass the error to the error handler if provided and continue iterating', function() {
            var errors = [];
            var result = {};
            var modifiedTestObject = _.clone(testObject);

            var errorHandler = function(e, value, path) {
                errors.push([e, value, path]);
            };
            var handler = function(content, path) {
                result[content] = path;
            };

            modifiedTestObject.foo.err = 0;

            extensionsCodegen.test.extensionIterator(handler, modifiedTestObject, null, errorHandler);
            assert.deepEqual(result, {
                a: ['foo', 'bar'],
                b: ['baz'],
                c: ['foobar'],
                d: ['bazBar', 'foo', 'bar'],
                e: ['foo', 'bazBar', 'fooBar']
            });
            assert.deepEqual(errors, [
                [new Error("Invalid type"), 0, ['foo', 'err']]
            ]);
        });
    });

    describe('merge', function() {
        it('Should merge different trees with ease', function() {
            assert.deepEqual(
                extensionsCodegen.test.merge(
                    [
                        {foo: 'bar'},
                        {foobar: 'baz'}
                    ]
                ), {
                    foo: 'bar',
                    foobar: 'baz'
                }
            );
        });

        it('Should prefer the last in the array on merge conflict', function() {
            assert.deepEqual(
                extensionsCodegen.test.merge(
                    [
                        {foo: 'bar'},
                        {foo: 'baz'}
                    ]
                ),{
                    foo: 'baz'
                }
            );
        });

        it('Should be able to merge deeply', function() {
            assert.deepEqual({
                foo: {bar: 'foobar'}
            }, extensionsCodegen.test.merge([
                {foo: {bar: 'baz'}},
                {foo: {bar: 'foobar'}}
            ]));
        });
    });

    describe('parse', function() {
        it('Should read the extensions/ folder and return code', function() {
            var result = extensionsCodegen.parse({
                extensions: extensionMockLocation
            });

            assert.equal(result, codegen);
        });
    });

    describe('readExtensionBundle', function() {
        it('Should read the extensions/ folder and put it into an object', function() {
            var buffer = [];

            assert.deepEqual(
                generics.bufferConsole(function() {
                    return extensionsCodegen.test.readExtensionBundle(
                        extensionMockLocation
                    );
                }, buffer),
                {commands: {test: extensionContent}}
            );

            assert.deepEqual(buffer, []);
        });
    });

    describe('readExtensionPacket', function() {
        it('Should read the test extension from demo/ and put it into an object', function() {
            assert.deepEqual(
                extensionsCodegen.test.readExtensionPacket(
                    path.join(extensionMockLocation, "demo/")
                ),
                {commands: {test: extensionContent}}
            );
        });
    });

    describe('readExtensionSubPacket', function() {
        it('Should read the test extension from demo/commands and put it into an object', function() {
            assert.deepEqual(
                extensionsCodegen.test.readExtensionSubPacket(
                    path.join(extensionMockLocation, "demo/commands")
                ),
                {test: extensionContent}
            );
        });
    });

    describe('readExtension', function() {
        it('Should read the test extension', function() {
            assert.equal(
                extensionsCodegen.test.readExtension(extensionLocation),
                extensionContent
            );
        });
    });

    describe('wrapCode', function() {
        it('Should wrap this', function() {
            assert.equal(
                extensionsCodegen.test.wrapCode("this"),
                "(function(){\nthis\n}());\n\n"
            );
        });
    });
});