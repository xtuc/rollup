import { decode } from '@webassemblyjs/wasm-parser';
import ast from '@webassemblyjs/ast';

import Graph from './Graph';
import { IdMap, ModuleJSON } from './rollup/types';

import { makeLegal } from './utils/identifierHelpers';
import { basename, extname } from './utils/path';

import ExternalModule from './ExternalModule';
import Module from './Module';

import ModuleScope from './ast/scopes/ModuleScope';
import Variable from './ast/variables/Variable';
import NamespaceVariable from './ast/variables/NamespaceVariable';

const decoderOpts = {
	ignoreCodeSection: true,
	ignoreDataSection: true
};

type BuildLoadArgs = {
	NAME: string;
	URL: string;
	IMPORT_OBJECT?: string;
};

// FIXME(sven): uncommented the loader you need for your current env
// how to get the env?

const generateLoadBinaryCode = (url: string) => `fetch("${url}")`;

// const generateLoadBinaryCode = (path: string) =>
// 	`new Promise(function (resolve, reject) {
// 		var {readFile} = require("fs");
// 		var {join} = require("path");

// 		try {
// 			readFile(join(__dirname, "${path}"), function(err, buffer) {
// 				if (err) return reject(err);

// 				// Fake fetch response
// 				resolve({
// 					arrayBuffer() {
// 						return Promise.resolve(buffer);
// 					}
// 				});
// 			});
// 		} catch (err) {
// 			reject(err);
// 		}
// 	});
// 	`;

const buildLoader = ({ NAME, URL, IMPORT_OBJECT }: BuildLoadArgs) => `
	// function then$${NAME}(resolve) {
	function then(resolve) {
		const req = ${generateLoadBinaryCode(URL)};

		if (typeof WebAssembly.instantiateStreaming === 'function') {
			WebAssembly
				.instantiateStreaming(req, ${IMPORT_OBJECT || '{}'})
				.then(res => res.instance.exports)
				.then(resolve)
				.catch(resolve);
		} else {
			req
				.then(x => x.arrayBuffer())
				.then(function(bytes) {
					return WebAssembly.instantiate(bytes, ${IMPORT_OBJECT || '{}'});
				})
				.then(res => res.instance.exports)
				.then(resolve)
				.catch(resolve);
		}
	}
`;

export interface ExportDescription {
	localName: string;
}

export interface ImportDescription {
	source: string;
	name: string;
	module: Module | ExternalModule | null;
}

export default class WasmModule {
	type: 'WasmModule';

	id: string;
	graph: Graph;
	code: Buffer;

	scope: ModuleScope;

	ast: ast.Program;

	sources: string[];
	resolvedIds: IdMap;

	dynamicImportResolutions: {
		alias: string;
		resolution: Module | ExternalModule | string | void;
	}[];
	dependencies: (Module | ExternalModule | WasmModule)[];

	imports: { [name: string]: ImportDescription };
	exports: { [name: string]: ExportDescription };

	// this is unused on Module,
	// only used for namespace and then ExternalExport.declarations
	declarations: {
		'*'?: NamespaceVariable;
		[name: string]: Variable | undefined;
	};

	isExternal: false;

	constructor(graph: Graph, id: string) {
		this.id = id;
		this.graph = graph;
		this.code = new Buffer('');

		this.ast = null;

		// imports and exports, indexed by local name
		this.imports = Object.create(null);
		this.exports = Object.create(null);
		this.resolvedIds = Object.create(null);
		this.declarations = Object.create(null);

		// all dependencies
		this.dynamicImportResolutions = [];
		this.sources = [];
		this.dependencies = [];

		this.scope = new ModuleScope(<any>this);

		// expose Thenable which is the entry point of our loader
		// this.exports['then$' + this.basename()] = {
		this.exports.then = {
			localName: 'then'
		};

		// FIXME(sven): a different then allows multiple wasm modules to be load
		// in the same chunk (avoids collision). I need to figure out how to
		// have an object like {then: then$foo} as the export;
	}

	render() {
		const NAME = this.basename();
		const URL = `/dist/${NAME}.wasm`;

		const content = buildLoader({ URL, NAME });

		return { trim() {}, content };
	}

	getDynamicImportExpressions(): (string | Node)[] {
		// FIXME(sven): consider ModuleImport as dynamicImports?
		return [];
	}

	markExports() {}

	// TODO(sven): what is this?
	namespace(): NamespaceVariable {
		if (!this.declarations['*']) {
			this.declarations['*'] = new NamespaceVariable(<any>this);
		}

		return this.declarations['*'];
	}

	basename() {
		const base = basename(this.id);
		const ext = extname(this.id);

		return makeLegal(ext ? base.slice(0, -ext.length) : base);
	}

	getExports() {
		return Object.keys(this.exports);
	}

	getReexports(): any[] {
		return [];
	}

	includeInBundle() {
		return false;
	}

	linkDependencies() {
		// const { imports, exports } = this;
		// ast.traverse(this.ast, {
		// 	ModuleImport({node}: any) {
		// 		const source = node.module
		// 		const name = node.name;
		// 		imports[`${source}.${name}`] = { source, name, module: this };
		// 	},
		// 	ModuleExport({node}: any) {
		// 		const name = node.name;
		// 		exports[name] = {
		// 			localName: name
		// 		};
		// 	}
		// });
	}

	bindReferences() {}

	toJSON(): ModuleJSON {
		return {
			id: this.id,
			dependencies: this.dependencies.map(module => module.id),
			code: this.code,
			originalCode: '',
			originalSourcemap: undefined,
			ast: this.ast,
			sourcemapChain: null,
			resolvedIds: this.resolvedIds
		};
	}

	traceExport(name: string): Variable {
		return new Variable(name);
	}

	setSource(bin: Buffer) {
		this.code = bin;
		this.ast = decode(bin, decoderOpts);
	}
}