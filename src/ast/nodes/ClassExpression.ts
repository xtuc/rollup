import ClassNode from './shared/ClassNode';
import Scope from '../scopes/Scope';
import ExecutionPathOptions from '../ExecutionPathOptions';
import { NodeType } from './NodeType';
import { ObjectPath } from '../values';

export default class ClassExpression extends ClassNode {
	type: NodeType.ClassExpression;

	initialiseChildren(parentScope: Scope) {
		this.id && this.id.initialiseAndDeclare(this.scope, 'class', this);
		super.initialiseChildren(parentScope);
	}

	reassignPath(_path: ObjectPath, _options: ExecutionPathOptions): void {}
}
