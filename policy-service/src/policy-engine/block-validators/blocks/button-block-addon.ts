import { BlockValidator, IBlockProp } from '../../block-validators/index.js';
import { CommonBlock } from './common.js';

/**
 * Document Buttons with UI
 */
export class ButtonBlockAddon {
    /**
     * Block type
     */
    public static readonly blockType: string = 'buttonBlockAddon';

    /**
     * Validate block options
     * @param validator
     * @param config
     */
    public static async validate(validator: BlockValidator, ref: IBlockProp): Promise<void> {
        try {
            await CommonBlock.validate(validator, ref);
            if (!ref.options.name) {
                validator.addError('Button name is empty');
            }
        } catch (error) {
            validator.addError(`Unhandled exception ${validator.getErrorMessage(error)}`);
        }
    }
}
