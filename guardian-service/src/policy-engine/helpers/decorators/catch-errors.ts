import { BlockErrorActions } from 'interfaces';
import { PolicyComponentsUtils } from '@policy-engine/policy-components-utils';

export function CatchErrors() {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        console.log(target, propertyKey, descriptor);
        descriptor.value = new Proxy(target[propertyKey], {
            async apply(target: any, thisArg: any, argArray: any[]): Promise<any> {
                const user = argArray[1];
                const f = async () => {
                    try {
                        await target.apply(thisArg, argArray);
                    } catch (e) {
                        console.error(e.message);
                        PolicyComponentsUtils.BlockErrorFn(thisArg.blockType, e.message, user);
                        switch (thisArg.options.onErrorAction) {
                            case BlockErrorActions.RETRY: {
                                setTimeout(f, parseInt(thisArg.options.errorTimeout, 10));
                                break;
                            }

                            case BlockErrorActions.GOTO_STEP: {
                                const stepParent = thisArg.parent;
                                const targetBlock = stepParent.children[parseInt(thisArg.options.errorFallbackStep, 10)];
                                if ((stepParent.blockType === 'interfaceStepBlock') && targetBlock) {
                                    await stepParent.changeStep(user, {}, targetBlock)
                                }
                                break;
                            }

                            case BlockErrorActions.GOTO_TAG: {
                                const stepParent = thisArg.parent;
                                const targetBlock = stepParent.children.find(c => c.tag === thisArg.options.errorFallbackTag);
                                if ((stepParent.blockType === 'interfaceStepBlock') && targetBlock) {
                                    await stepParent.changeStep(user, {}, targetBlock)
                                }
                                break;
                            }

                            default:
                                return;

                        }
                    }
                }

                await f();
            }
        })
    }
}
