import { CronJob } from 'cron';
import { ActionCallback, EventBlock } from '@policy-engine/helpers/decorators';
import { IVC, Schema, SchemaField, SchemaHelper, TopicType } from '@guardian/interfaces';
import { PolicyComponentsUtils } from '@policy-engine/policy-components-utils';
import { CatchErrors } from '@policy-engine/helpers/decorators/catch-errors';
import { IPolicyEvent, PolicyInputEventType, PolicyOutputEventType } from '@policy-engine/interfaces';
import { ChildrenType, ControlType, PropertyType } from '@policy-engine/interfaces/block-about';
import { AnyBlockType, IPolicyDocument, IPolicyValidatorBlock } from '@policy-engine/policy-engine.interface';
import { BlockActionError } from '@policy-engine/errors';
import { IPolicyUser } from '@policy-engine/policy-user';
import { IHederaAccount, PolicyUtils } from '@policy-engine/helpers/utils';
import {
    MessageServer,
    MessageAction,
    SchemaMessage,
    UrlType,
    PolicyMessage,
    TopicMessage,
    ExternalDocument,
    MessageType,
    VCMessage,
    VcHelper,
    IPFS,
} from '@guardian/common';
import {
    ExternalDocuments,
    ExternalEvent,
    ExternalEventType
} from '@policy-engine/interfaces/external-event';


/**
 * Search Topic Result
 */
interface TopicResult {
    count?: number;
    schemas?: SchemaMessage[];
    instance?: PolicyMessage;
    root?: TopicMessage;
    instanceTopic?: TopicMessage;
    policyTopic?: TopicMessage;
}

enum TaskStatus {
    NeedTopic = 'NEED_TOPIC',
    NeedSchema = 'NEED_SCHEMA',
    Free = 'FREE',
    Search = 'SEARCH',
    Verification = 'VERIFICATION',
    Processing = 'PROCESSING',
    Error = 'ERROR'
}

enum SchemaStatus {
    NotVerified = 'NOT_VERIFIED',
    Incompatible = 'INCOMPATIBLE',
    Compatible = 'COMPATIBLE',
}

/**
 * External topic block
 */
@EventBlock({
    blockType: 'externalTopicBlock',
    commonBlock: false,
    about: {
        label: 'External Topic',
        title: `Add 'External Topic' Block`,
        post: true,
        get: true,
        children: ChildrenType.Special,
        control: ControlType.UI,
        input: [
            PolicyInputEventType.TimerEvent
        ],
        output: [
            PolicyOutputEventType.RunEvent,
            PolicyOutputEventType.RefreshEvent,
            PolicyOutputEventType.ErrorEvent
        ],
        defaultEvent: true,
        properties: [{
            name: 'schema',
            label: 'Schema',
            title: 'Schema',
            type: PropertyType.Schemas
        }]
    },
    variables: [
        { path: 'options.schema', alias: 'schema', type: 'Schema' }
    ]
})
export class ExternalTopicBlock {
    /**
     * Schema
     * @private
     */
    private schema: Schema | null;

    /**
     * Cron job
     * @private
     */
    private job: CronJob;

    /**
     * After init callback
     */
    protected afterInit() {
        this.job = new CronJob(`0 0 * * *`, () => {
            this.run().then();
        }, null, false, 'UTC');
        this.job.start();
    }

    /**
     * Block destructor
     */
    protected destroy() {
        if (this.job) {
            this.job.stop();
        }
    }

    /**
     * Get Validators
     */
    protected getValidators(): IPolicyValidatorBlock[] {
        const ref = PolicyComponentsUtils.GetBlockRef(this);
        const validators: IPolicyValidatorBlock[] = [];
        for (const child of ref.children) {
            if (child.blockClassName === 'ValidatorBlock') {
                validators.push(child as IPolicyValidatorBlock);
            }
        }
        return validators;
    }

    /**
     * Validate Documents
     * @param user
     * @param state
     */
    protected async validateDocuments(user: IPolicyUser, state: any): Promise<string> {
        const validators = this.getValidators();
        for (const validator of validators) {
            const error = await validator.run({
                type: null,
                inputType: null,
                outputType: null,
                policyId: null,
                source: null,
                sourceId: null,
                target: null,
                targetId: null,
                user,
                data: state
            });
            if (error) {
                return error;
            }
        }
        return null;
    }

    private updateStatus(ref: AnyBlockType, item: ExternalDocument, user: IPolicyUser) {
        console.log('updateStatus', item.status);
        ref.updateBlock({ status: item.status }, user);
    }

    private getSchemaFields(document: any) {
        try {
            if (typeof document === 'string') {
                document = JSON.parse(document);
            }
            return SchemaHelper.parseFields(document, null, null, false);
        } catch (error) {
            return null;
        }
    }

    private compareFields(f1: SchemaField, f2: SchemaField): boolean {
        if (
            f1.name !== f2.name ||
            f1.title !== f2.title ||
            f1.description !== f2.description ||
            f1.required !== f2.required ||
            f1.isArray !== f2.isArray ||
            f1.isRef !== f2.isRef
        ) {
            return false;
        }
        if (f1.isRef) {
            return true;
        } else {
            return (
                f1.type === f2.type &&
                f1.format === f2.format &&
                f1.pattern === f2.pattern &&
                f1.unit === f2.unit &&
                f1.unitSystem === f2.unitSystem &&
                f1.customType === f2.customType
            );
        }
        // remoteLink?: string;
        // enum?: string[];
    }

    private ifExtendFields(extension: SchemaField[], base: SchemaField[]): boolean {
        try {
            if (!extension || !base) {
                return false;
            }
            const map = new Map<string, SchemaField>();
            for (const f of extension) {
                map.set(f.name, f);
            }
            for (const baseField of base) {
                const extensionField = map.get(baseField.name)
                if (!extensionField) {
                    return false;
                }
                if (!this.compareFields(baseField, extensionField)) {
                    return false;
                }
                if (baseField.isRef) {
                    if (!this.ifExtendFields(extensionField.fields, baseField.fields)) {
                        return false;
                    }
                }
            }
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get Schema
     */
    private async getSchema(): Promise<Schema> {
        const ref = PolicyComponentsUtils.GetBlockRef<AnyBlockType>(this);
        if (!ref.options.schema) {
            return null;
        }
        if (!this.schema) {
            const schema = await ref.databaseServer.getSchemaByIRI(ref.options.schema, ref.topicId);
            this.schema = schema ? new Schema(schema) : null;
            if (!this.schema) {
                throw new BlockActionError('Waiting for schema', ref.blockType, ref.uuid);
            }
        }
        return this.schema;
    }

    private async verification(item: any): Promise<void> {
        try {
            const schema = await this.getSchema();
            if (!schema) {
                item.status = SchemaStatus.Incompatible;
                return;
            }
            if (!item) {
                item.status = SchemaStatus.Incompatible;
                return;
            }
            const document = await IPFS.getFile(item.cid, 'str');
            const base = this.getSchemaFields(schema.document);
            const extension = this.getSchemaFields(document);
            const verified = this.ifExtendFields(extension, base);
            item.status = verified ? SchemaStatus.Compatible : SchemaStatus.Incompatible;
        } catch (error) {
            item.status = SchemaStatus.Incompatible;
            return;
        }
    }

    private async getUser(user: IPolicyUser): Promise<ExternalDocument> {
        const ref = PolicyComponentsUtils.GetBlockRef<AnyBlockType>(this);
        let item = await ref.databaseServer.getExternalTopic(ref.policyId, ref.uuid, user.did);
        if (!item) {
            item = await ref.databaseServer.createExternalTopic({
                policyId: ref.policyId,
                blockId: ref.uuid,
                owner: user.did,
                documentTopicId: '',
                policyTopicId: '',
                instanceTopicId: '',
                documentMessage: null,
                policyMessage: null,
                policyInstanceMessage: null,
                schemas: [],
                schema: null,
                schemaId: null,
                active: false,
                lastMessage: '',
                lastUpdate: '',
                status: TaskStatus.NeedTopic
            });
        }
        return item;
    }

    private async searchTopic(topicId: string, topicTree: TopicResult = {}): Promise<TopicResult> {
        const ref = PolicyComponentsUtils.GetBlockRef<AnyBlockType>(this);
        if (topicTree.count) {
            topicTree.count++;
        } else {
            topicTree.count = 1;
        }
        if (topicTree.count > 20) {
            throw new BlockActionError('Max attempts of 20 was reached for request: Get topic info', ref.blockType, ref.uuid);
        }
        const topicMessage = await MessageServer.getTopic(topicId);
        if (!topicTree.root) {
            if (topicMessage && (
                topicMessage.messageType === TopicType.InstancePolicyTopic ||
                topicMessage.messageType === TopicType.DynamicTopic
            )) {
                topicTree.root = topicMessage;
            } else {
                throw new BlockActionError('Invalid topic', ref.blockType, ref.uuid);
            }
        }
        if (topicMessage) {
            if (topicMessage.messageType === TopicType.PolicyTopic) {
                if (!topicTree.instanceTopic) {
                    throw new BlockActionError('Invalid topic', ref.blockType, ref.uuid);
                }
                topicTree.policyTopic = topicMessage;
                const messages: any[] = await MessageServer.getMessages(topicId);
                topicTree.schemas = messages.filter((m: SchemaMessage) =>
                    m.action === MessageAction.PublishSchema);
                topicTree.instance = messages.find((m: PolicyMessage) =>
                    m.action === MessageAction.PublishPolicy &&
                    m.instanceTopicId === topicTree.instanceTopic.topicId);
                return topicTree;
            } else if (topicMessage.messageType === TopicType.InstancePolicyTopic) {
                topicTree.instanceTopic = topicMessage;
                return await this.searchTopic(topicMessage.parentId, topicTree);
            } else if (topicMessage.messageType === TopicType.DynamicTopic) {
                return await this.searchTopic(topicMessage.parentId, topicTree);
            }
        }
        throw new BlockActionError('Invalid topic', ref.blockType, ref.uuid);
    }

    private async addTopic(
        item: ExternalDocument,
        topicId: string,
        user: IPolicyUser
    ): Promise<void> {
        const ref = PolicyComponentsUtils.GetBlockRef<AnyBlockType>(this);
        try {
            const topicTree = await this.searchTopic(topicId);
            const topic = topicTree.root;
            const policy = topicTree.policyTopic;
            const instance = topicTree.instance;
            const list = [];
            for (const schema of topicTree.schemas) {
                list.push({
                    id: schema.getContextUrl(UrlType.url),
                    name: schema.name,
                    cid: schema.getDocumentUrl(UrlType.cid),
                    status: SchemaStatus.NotVerified
                });
            }
            item.status = TaskStatus.NeedSchema;
            item.documentTopicId = topic.topicId?.toString();
            item.policyTopicId = policy.topicId?.toString();
            item.instanceTopicId = instance.instanceTopicId?.toString();
            item.documentMessage = topic.toMessageObject();
            item.policyMessage = policy.toMessageObject();
            item.policyInstanceMessage = instance.toMessageObject();
            item.schemas = list;
            item.active = false;
            item.lastMessage = '';
            item.lastUpdate = '';
            await ref.databaseServer.updateExternalTopic(item);
            this.updateStatus(ref, item, user);
        } catch (error) {
            item.status = TaskStatus.Error;
            ref.databaseServer.updateExternalTopic(item);
            ref.error(`setData: ${PolicyUtils.getErrorMessage(error)}`);
        }
    }

    private async verificationSchema(
        item: ExternalDocument,
        schema: any,
        user: IPolicyUser
    ): Promise<void> {
        const ref = PolicyComponentsUtils.GetBlockRef<AnyBlockType>(this);
        try {
            await this.verification(schema);
            item.status = TaskStatus.NeedSchema;
            await ref.databaseServer.updateExternalTopic(item);
            this.updateStatus(ref, item, user);
        } catch (error) {
            ref.error(`setData: ${PolicyUtils.getErrorMessage(error)}`);
            item.status = TaskStatus.Error;
            await ref.databaseServer.updateExternalTopic(item);
            this.updateStatus(ref, item, user);
        }
    }

    private async verificationSchemas(
        item: ExternalDocument,
        schemas: any[],
        user: IPolicyUser
    ): Promise<void> {
        const ref = PolicyComponentsUtils.GetBlockRef<AnyBlockType>(this);
        try {
            for (const schema of schemas) {
                if (schema.status === SchemaStatus.NotVerified) {
                    await this.verification(schema);
                }
            }
            item.status = TaskStatus.NeedSchema;
            await ref.databaseServer.updateExternalTopic(item);
            this.updateStatus(ref, item, user);
        } catch (error) {
            ref.error(`setData: ${PolicyUtils.getErrorMessage(error)}`);
            item.status = TaskStatus.Error;
            await ref.databaseServer.updateExternalTopic(item);
            this.updateStatus(ref, item, user);
        }
    }

    private async setSchema(
        item: ExternalDocument,
        schema: any,
        user: IPolicyUser
    ): Promise<void> {
        const ref = PolicyComponentsUtils.GetBlockRef<AnyBlockType>(this);
        try {
            await this.verification(schema);
            if (schema.status === SchemaStatus.Compatible) {
                item.status = TaskStatus.Free;
                item.schemaId = schema.id;
                item.schema = schema;
                item.active = true;
            } else {
                item.status = TaskStatus.NeedSchema;
            }
            await ref.databaseServer.updateExternalTopic(item);
            this.updateStatus(ref, item, user);
        } catch (error) {
            ref.error(`setData: ${PolicyUtils.getErrorMessage(error)}`);
            item.status = TaskStatus.Error;
            await ref.databaseServer.updateExternalTopic(item);
            this.updateStatus(ref, item, user);
        }
    }

    private async checkDocument(item: ExternalDocument, document: IVC): Promise<string> {
        if (!document) {
            return 'Invalid document';
        }

        if (
            !Array.isArray(document['@context']) ||
            document['@context'].indexOf(item.schemaId) === -1
        ) {
            return 'Invalid schema';
        }

        let verify: boolean;
        try {
            const VCHelper = new VcHelper();
            const res = await VCHelper.verifySchema(document);
            verify = res.ok;
            if (verify) {
                verify = await VCHelper.verifyVC(document);
            }
        } catch (error) {
            verify = false;
        }

        if (!verify) {
            return 'Invalid proof';
        }

        return null;
    }

    private async checkMessage(
        ref: AnyBlockType,
        item: ExternalDocument,
        hederaAccount: IHederaAccount,
        user: IPolicyUser,
        message: VCMessage
    ): Promise<void> {
        if (message.type !== MessageType.VCDocument) {
            return;
        }
        // if (message.payer !== hederaAccount.hederaAccountId) {
        //     console.log(' --- ', message.payer);
        //     return;
        // }

        await MessageServer.loadDocument(message, hederaAccount.hederaAccountKey);

        const document: IVC = message.getDocument();
        const error = await this.checkDocument(item, document);
        if (error) {
            console.log('--- error', error);
            return;
        }

        const result: IPolicyDocument = PolicyUtils.createPolicyDocument(ref, user, document);
        result.schema = ref.options.schema;

        const state = { data: result };
        ref.triggerEvents(PolicyOutputEventType.RunEvent, user, state);
        ref.triggerEvents(PolicyOutputEventType.ReleaseEvent, user, null);
        ref.triggerEvents(PolicyOutputEventType.RefreshEvent, user, state);
        PolicyComponentsUtils.ExternalEventFn(new ExternalEvent(ExternalEventType.Run, ref, user, {
            documents: ExternalDocuments(result)
        }));
    }

    private async receiveData(item: ExternalDocument, user: IPolicyUser): Promise<void> {
        const ref = PolicyComponentsUtils.GetBlockRef<AnyBlockType>(this);
        const hederaAccount = await PolicyUtils.getHederaAccount(ref, item.owner);
        const messages: VCMessage[] = await MessageServer.getMessages(
            item.documentTopicId,
            null,
            null,
            item.lastMessage
        );
        for (const message of messages) {
            await this.checkMessage(ref, item, hederaAccount, user, message);
            item.lastMessage = message.id;
            await ref.databaseServer.updateExternalTopic(item);
        }
    }

    private async runByUser(item: ExternalDocument): Promise<void> {
        const ref = PolicyComponentsUtils.GetBlockRef<AnyBlockType>(this);

        item.status = TaskStatus.Processing;
        await ref.databaseServer.updateExternalTopic(item);

        const user = await PolicyUtils.createPolicyUser(ref, item.owner);
        this.updateStatus(ref, item, user);
        try {
            await this.receiveData(item, user);
            item.status = TaskStatus.Free;
            item.lastUpdate = (new Date()).toISOString();
            await ref.databaseServer.updateExternalTopic(item);
        } catch (error) {
            item.status = TaskStatus.Free;
            await ref.databaseServer.updateExternalTopic(item);
            ref.error(`setData: ${PolicyUtils.getErrorMessage(error)}`);
        }
        this.updateStatus(ref, item, user);
    }

    /**
     * Tick cron
     */
    public async run() {
        const ref = PolicyComponentsUtils.GetBlockRef<AnyBlockType>(this);
        const items = await ref.databaseServer.getActiveExternalTopics(ref.policyId, ref.uuid);
        for (const item of items) {
            if (item.status === TaskStatus.Free) {
                await this.runByUser(item);
            }
        }
    }

    /**
     * Set block data
     * @param user
     * @param _data
     */
    @ActionCallback({
        output: [
            PolicyOutputEventType.RunEvent,
            PolicyOutputEventType.RefreshEvent
        ]
    })
    public async setData(user: IPolicyUser, data: any): Promise<any> {
        const ref = PolicyComponentsUtils.GetBlockRef<AnyBlockType>(this);
        ref.log(`setData`);

        if (!user?.did) {
            throw new BlockActionError('User have no any did', ref.blockType, ref.uuid);
        }

        const { operation, value } = data;

        try {
            const item = await this.getUser(user);
            switch (operation) {
                case 'SetTopic': {
                    if (!value) {
                        throw new BlockActionError('Invalid value', ref.blockType, ref.uuid);
                    }

                    if (item.status !== TaskStatus.NeedTopic) {
                        throw new BlockActionError('Topic already set', ref.blockType, ref.uuid);
                    }

                    item.status = TaskStatus.Search;
                    await ref.databaseServer.updateExternalTopic(item);

                    this.addTopic(item, value, user);
                    break;
                }
                case 'VerificationSchema': {
                    if (!value) {
                        throw new BlockActionError('Invalid value', ref.blockType, ref.uuid);
                    }

                    if (item.status === TaskStatus.NeedTopic) {
                        throw new BlockActionError('Topic not set.', ref.blockType, ref.uuid);
                    }

                    if (item.status !== TaskStatus.NeedSchema) {
                        throw new BlockActionError('Schema already set', ref.blockType, ref.uuid);
                    }

                    if (!item.schemas) {
                        throw new BlockActionError('Schema not found', ref.blockType, ref.uuid);
                    }

                    const schema = item.schemas.find(s => s.id === value);
                    if (!schema) {
                        throw new BlockActionError('Schema not found', ref.blockType, ref.uuid);
                    }

                    item.status = TaskStatus.Verification;
                    await ref.databaseServer.updateExternalTopic(item);

                    this.verificationSchema(item, schema, user);
                    break;
                }
                case 'VerificationSchemas': {
                    if (item.status === TaskStatus.NeedTopic) {
                        throw new BlockActionError('Topic not set.', ref.blockType, ref.uuid);
                    }

                    if (item.status !== TaskStatus.NeedSchema) {
                        throw new BlockActionError('Schema already set', ref.blockType, ref.uuid);
                    }

                    if (!item.schemas) {
                        throw new BlockActionError('Schema not found', ref.blockType, ref.uuid);
                    }

                    item.status = TaskStatus.Verification;
                    await ref.databaseServer.updateExternalTopic(item);

                    this.verificationSchemas(item, item.schemas, user);
                    break;
                }
                case 'SetSchema': {
                    if (!value) {
                        throw new BlockActionError('Invalid value', ref.blockType, ref.uuid);
                    }

                    if (item.status === TaskStatus.NeedTopic) {
                        throw new BlockActionError('Topic not set.', ref.blockType, ref.uuid);
                    }

                    if (item.status !== TaskStatus.NeedSchema) {
                        throw new BlockActionError('Schema already set', ref.blockType, ref.uuid);
                    }

                    if (!item.schemas) {
                        throw new BlockActionError('Schema not found', ref.blockType, ref.uuid);
                    }

                    const schema = item.schemas.find(s => s.id === value);
                    if (!schema) {
                        throw new BlockActionError('Schema not found', ref.blockType, ref.uuid);
                    }

                    item.status = TaskStatus.Verification;
                    await ref.databaseServer.updateExternalTopic(item);

                    this.setSchema(item, schema, user);
                    break;
                }
                case 'LoadDocuments': {
                    if (item.status !== TaskStatus.Free) {
                        throw new BlockActionError('Process already started', ref.blockType, ref.uuid);
                    }

                    item.status = TaskStatus.Processing;
                    await ref.databaseServer.updateExternalTopic(item);

                    this.runByUser(item).then(null, (error) => {
                        item.status = TaskStatus.Error;
                        ref.databaseServer.updateExternalTopic(item);
                        ref.error(`setData: ${PolicyUtils.getErrorMessage(error)}`);
                    });
                    break;
                }
                case 'Restart': {
                    if (
                        item.status !== TaskStatus.NeedTopic &&
                        item.status !== TaskStatus.NeedSchema
                    ) {
                        throw new BlockActionError('', ref.blockType, ref.uuid);
                    }
                    item.documentTopicId = '';
                    item.policyTopicId = '';
                    item.instanceTopicId = '';
                    item.documentMessage = '';
                    item.policyMessage = '';
                    item.policyInstanceMessage = '';
                    item.schemas = [];
                    item.schema = null;
                    item.schemaId = null;
                    item.active = false;
                    item.lastMessage = '';
                    item.lastUpdate = '';
                    item.status = TaskStatus.NeedTopic;
                    await ref.databaseServer.updateExternalTopic(item);
                    break;
                }

                default: {
                    throw new BlockActionError('Invalid operation', ref.blockType, ref.uuid);
                }
            }
        } catch (error) {
            ref.error(`setData: ${PolicyUtils.getErrorMessage(error)}`);
            throw new BlockActionError(error, ref.blockType, ref.uuid);
        }
    }

    /**
     * Get block data
     * @param user
     */
    public async getData(user: IPolicyUser): Promise<any> {
        const ref = PolicyComponentsUtils.GetBlockRef(this);
        const item = await ref.databaseServer.getExternalTopic(ref.policyId, ref.uuid, user.did);
        if (item) {
            return {
                documentTopicId: item.documentTopicId,
                policyTopicId: item.policyTopicId,
                instanceTopicId: item.instanceTopicId,
                documentMessage: item.documentMessage,
                policyMessage: item.policyMessage,
                policyInstanceMessage: item.policyInstanceMessage,
                schemas: item.schemas,
                schema: item.schema,
                lastUpdate: item.lastUpdate,
                status: item.status
            };
        } else {
            return {};
        }
    }
}
