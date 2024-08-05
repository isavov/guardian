import { BasicBlock } from '../helpers/decorators/index.js';
import { PolicyComponentsUtils } from '../policy-components-utils.js';
import {
    IPolicyAddonBlock,
} from '../policy-engine.interface.js';
import {
    ChildrenType,
    ControlType,
    PropertyType,
} from '../interfaces/block-about.js';
import { PolicyUser } from '../policy-user.js';
import { findOptions } from '../helpers/find-options.js';
import { BlockActionError } from '../errors/index.js';

/**
 * Button with UI
 */
@BasicBlock({
    blockType: 'dropdownBlockAddon',
    commonBlock: false,
    about: {
        label: 'Dropdown Addon',
        title: `Add 'Dropdown Addon' Block`,
        post: true,
        get: true,
        children: ChildrenType.Special,
        control: ControlType.Special,
        input: null,
        output: null,
        defaultEvent: false,
        properties: [
            {
                name: 'label',
                label: 'Options Label',
                title: 'Button Name',
                type: PropertyType.Input,
            },
            {
                name: 'optionName',
                label: 'Option Name',
                title: 'Option Name',
                type: PropertyType.Input,
            },
            {
                name: 'optionValue',
                label: 'Option Value',
                title: 'Option Value',
                type: PropertyType.Input,
                required: true,
            },
            {
                name: 'field',
                label: 'Field',
                title: 'Field',
                type: PropertyType.Path,
                required: true,
            },
        ],
    },
    variables: [],
})
export class DropdownBlockAddon {
    /**
     * Get block data
     * @param user
     */
    async getData(user: PolicyUser): Promise<any> {
        const ref = PolicyComponentsUtils.GetBlockRef<IPolicyAddonBlock>(this);

        const documents: any[] = await ref.getSources(user, null);

        const data: any = {
            id: ref.uuid,
            blockType: ref.blockType,
            ...ref.options,
            documents: documents.map((e) => {
                return {
                    name: findOptions(e, ref.options.optionName),
                    value: e.id,
                };
            }),
        };
        return data;
    }

    /**
     * Set block data
     * @param user
     * @param blockData
     */
    async setData(
        user: PolicyUser,
        blockData: {
            documentId: string;
            dropdownDocumentId: string;
        }
    ): Promise<any> {
        const ref = PolicyComponentsUtils.GetBlockRef<IPolicyAddonBlock>(this);
        const documents: any[] = await ref.getSources(user, null);
        const document = documents.find(
            // tslint:disable-next-line:no-shadowed-variable
            (document) => document.id === blockData.dropdownDocumentId
        );
        if (!document) {
            throw new BlockActionError(
                `Document doesn't exist in dropdown options`,
                ref.blockType,
                ref.uuid
            );
        }
        const parent = PolicyComponentsUtils.GetBlockRef<any>(ref.parent);
        await parent.onButtonAddonClick(user, ref.tag, blockData.documentId, {
            field: ref.options.field,
            value: findOptions(document, ref.options.optionValue),
        });
    }
}
