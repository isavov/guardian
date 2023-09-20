import { DatabaseServer, PolicyTool } from '@guardian/common';
import { BlockValidator } from './block-validator';
import { ModuleValidator } from './module-validator';
import { ISerializedErrors } from './interfaces/serialized-errors.interface';
import { IModulesErrors } from './interfaces/modules-errors.interface';
import { ISchema } from '@guardian/interfaces';

/**
 * Policy Validator
 */
export class ToolValidator {
    /**
     * UUID
     * @private
     */
    private readonly uuid: string;
    /**
     * Common errors
     * @private
     */
    private readonly errors: string[];
    /**
     * Blocks map
     * @private
     */
    private readonly blocks: Map<string, BlockValidator>;
    /**
     * Tags
     * @private
     */
    private readonly tags: Map<string, number>;
    /**
     * Schemas
     * @private
     */
    private readonly schemas: Map<string, ISchema>;
    /**
     * Tokens
     * @private
     */
    private readonly tokens: string[];
    /**
     * Topics
     * @private
     */
    private readonly topics: string[];
    /**
     * Topics
     * @private
     */
    private readonly tokenTemplates: string[];
    /**
     * Groups
     * @private
     */
    private readonly groups: string[];
    /**
     * Variables
     * @private
     */
    private readonly variables: any[];
    /**
     * Permissions
     * @private
     */
    private readonly permissions: string[];

    constructor(tool: any) {
        this.uuid = tool.id;
        this.errors = [];
        this.blocks = new Map();

        this.permissions = ['NO_ROLE', 'ANY_ROLE', 'OWNER'];
        this.tags = new Map();
        this.schemas = new Map();
        this.tokens = [];
        this.topics = [];
        this.tokenTemplates = [];
        this.groups = [];
        this.variables = [];

        this.registerVariables(tool);
        if (Array.isArray(tool.children)) {
            for (const child of tool.children) {
                this.registerBlock(child);
            }
        }
    }

    /**
     * Register new block
     * @param block
     */
    public registerVariables(tool: any): void {
        if (Array.isArray(tool.variables)) {
            for (const variable of tool.variables) {
                this.variables.push(variable);
                switch (variable.type) {
                    case 'Schema': {
                        this.schemas.set(variable.name, variable.baseSchema);
                        break;
                    }
                    case 'Token':
                        this.tokens.push(variable.name);
                        break;
                    case 'Role':
                        this.permissions.push(variable.name);
                        break;
                    case 'Group':
                        this.groups.push(variable.name);
                        break;
                    case 'TokenTemplate':
                        this.tokenTemplates.push(variable.name);
                        break;
                    case 'Topic':
                        this.topics.push(variable.name);
                        break;
                    default:
                        this.errors.push(`Type '${variable.type}' does not exist`);
                        break;
                }
            }
        }
        const events = new Map<string, number>();
        if (Array.isArray(tool.inputEvents)) {
            for (const e of tool.inputEvents) {
                if (events.has(e.name)) {
                    events.set(e.name, 2);
                } else {
                    events.set(e.name, 1);
                }
            }
        }
        if (Array.isArray(tool.outputEvents)) {
            for (const e of tool.outputEvents) {
                if (events.has(e.name)) {
                    events.set(e.name, 2);
                } else {
                    events.set(e.name, 1);
                }
            }
        }
        for (const [name, count] of events.entries()) {
            if (count > 1) {
                this.errors.push(`Event '${name}' already exist`);
            }
        }
    }

    /**
     * Register new block
     * @param block
     */
    public registerBlock(block: any): BlockValidator {
        let validator: BlockValidator;
        if (block.id) {
            if (this.blocks.has(block.id)) {
                validator = this.blocks.get(block.id);
                this.errors.push(`UUID ${block.id} already exist`);
            } else {
                validator = new BlockValidator(block, this);
                this.blocks.set(block.id, validator);
            }
        } else {
            validator = new BlockValidator(block, this);
            this.errors.push(`UUID is not set`);
        }
        if (block.tag) {
            if (this.tags.has(block.tag)) {
                this.tags.set(block.tag, 2);
            } else {
                this.tags.set(block.tag, 1);
            }
        }
        if (Array.isArray(block.children)) {
            for (const child of block.children) {
                const v = this.registerBlock(child);
                validator.addChild(v);
            }
        }
        return validator;
    }

    /**
     * Get permission
     * @param permission
     */
    public getPermission(permission: string): string {
        if (this.permissions.indexOf(permission) !== -1) {
            return permission;
        }
        return null
    }

    /**
     * Tag Count
     * @param tag
     */
    public tagCount(tag: string): number {
        if (this.tags.has(tag)) {
            return this.tags.get(tag);
        }
        return 0;
    }

    /**
     * Permissions not exist
     * @param permissions
     */
    public permissionsNotExist(permissions: string[]): string | null {
        if (permissions) {
            for (const permission of permissions) {
                if (this.permissions.indexOf(permission) === -1) {
                    return permission;
                }
            }
        }
        return null;
    }

    /**
     * Get tag
     * @param tag
     */
    public getTag(tag: string): boolean {
        return this.tags.has(tag);
    }

    /**
     * Get Schema
     * @param iri
     */
    public async getSchema(iri: string): Promise<any> {
        let r = this.schemas.get(iri);
        if (typeof r === 'string') {
            r = await new DatabaseServer(null).getSchemaByIRI(r);
        }
        return r;
    }

    /**
     * Get Token Template
     * @param templateName
     */
    public getTokenTemplate(templateName: string): any {
        if (this.tokenTemplates.indexOf(templateName) === -1) {
            return null;
        } else {
            return {};
        }
    }

    /**
     * Get Token
     * @param tokenId
     */
    public async getToken(tokenId: string): Promise<any> {
        if (this.tokens.indexOf(tokenId) === -1) {
            return null;
        } else {
            return {};
        }
    }

    /**
     * Get Topic Template
     * @param topicName
     */
    public getTopicTemplate(topicName: string): any {
        if (this.topics.indexOf(topicName) === -1) {
            return null;
        } else {
            return {};
        }
    }

    /**
     * Get Group
     * @param iri
     */
    public getGroup(group: string): any {
        if (this.groups.indexOf(group) === -1) {
            return null;
        } else {
            return {};
        }
    }

    /**
     * Clear
     */
    public clear(): void {
        for (const item of this.blocks.values()) {
            item.clear();
        }
    }

    /**
     * Validate
     */
    public async validate(): Promise<void> {
        for (const item of this.blocks.values()) {
            await item.validate();
        }
    }

    /**
     * Get serialized errors
     */
    public getSerializedErrors(): IModulesErrors {
        let valid = !this.errors.length;
        const blocksErrors = [];
        for (const item of this.blocks.values()) {
            const result = item.getSerializedErrors()
            blocksErrors.push(result);
            valid = valid && result.isValid;
        }
        for (const item of this.errors) {
            blocksErrors.push({
                id: null,
                name: null,
                errors: [item],
                isValid: false
            });
        }
        const commonErrors = this.errors.slice();
        return {
            id: this.uuid,
            isValid: valid,
            errors: commonErrors,
            blocks: blocksErrors
        }
    }
}