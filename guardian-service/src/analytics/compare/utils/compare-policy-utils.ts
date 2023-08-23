import { ICompareOptions } from '../interfaces/compare-options.interface';
import { IModel } from '../interfaces/model.interface';
import { IRateMap } from '../interfaces/rate-map.interface';
import { IRate } from '../interfaces/rate.interface';
import { IWeightModel, IWeightTreeModel } from '../interfaces/weight-model.interface';
import { BlockModel } from '../models/block.model';
import { DocumentModel } from '../models/document.model';
import { BlocksRate } from '../rates/blocks-rate';
import { DocumentsRate } from '../rates/documents-rate';
import { ObjectRate } from '../rates/object-rate';
import { Rate } from '../rates/rate';
import { Status } from '../types/status.type';
import { MergeUtils } from './merge-utils';

/**
 * Compare Utils
 */
export class ComparePolicyUtils {
    /**
      * Compare two trees
      * @param tree1
      * @param tree2
      * @param options
      * @public
      * @static
      */
    public static compareBlocks(
        tree1: BlockModel,
        tree2: BlockModel,
        options: ICompareOptions
    ): BlocksRate {
        const createRate = (tree1: BlockModel, tree2: BlockModel) => {
            const rate = new BlocksRate(tree1, tree2);
            rate.calc(options);
            return rate;
        }
        return ComparePolicyUtils.compareTree(tree1, tree2, createRate);
    }

    /**
      * Compare two trees
      * @param tree1
      * @param tree2
      * @param options
      * @public
      * @static
      */
    public static compareDocuments(
        tree1: DocumentModel,
        tree2: DocumentModel,
        options: ICompareOptions
    ): DocumentsRate {
        const createRate = (tree1: DocumentModel, tree2: DocumentModel) => {
            const rate = new DocumentsRate(tree1, tree2);
            rate.calc(options);
            return rate;
        }
        return ComparePolicyUtils.compareTree(tree1, tree2, createRate);
    }

    /**
     * Compare two trees
     * @param tree1
     * @param tree2
     * @param options
     * @public
     * @static
     */
    public static compareTree<T extends IRate<IModel>>(
        tree1: IWeightTreeModel,
        tree2: IWeightTreeModel,
        createRate: (tree1: IWeightTreeModel, tree2: IWeightTreeModel) => T
    ): T {
        const rate = createRate(tree1, tree2);
        if (!tree1 && !tree2) {
            return rate;
        }
        if (tree1 && !tree2) {
            rate.type = Status.LEFT;
            rate.setChildren(
                ComparePolicyUtils.compareChildren(
                    Status.LEFT,
                    tree1.children,
                    null,
                    createRate
                )
            );
            return rate;
        }
        if (!tree1 && tree2) {
            rate.type = Status.RIGHT;
            rate.setChildren(
                ComparePolicyUtils.compareChildren(
                    Status.RIGHT,
                    null,
                    tree2.children,
                    createRate
                )
            );
            return rate;
        }
        if (tree1.equal(tree2)) {
            rate.type = Status.FULL;
            rate.setChildren(
                ComparePolicyUtils.compareChildren(
                    Status.FULL,
                    tree1.children,
                    tree2.children,
                    createRate
                )
            );
            return rate;
        }
        if (tree1.key === tree2.key) {
            rate.type = Status.PARTLY;
            rate.setChildren(
                ComparePolicyUtils.compareChildren(
                    Status.PARTLY,
                    tree1.children,
                    tree2.children,
                    createRate
                )
            );
            return rate;
        } else {
            rate.type = Status.LEFT_AND_RIGHT;
            rate.setChildren(
                ComparePolicyUtils.compareChildren(
                    Status.LEFT_AND_RIGHT,
                    tree1.children,
                    tree2.children,
                    createRate
                )
            );
            return rate;
        }
    }

    /**
     * Compare two array (with children)
     * @param type
     * @param children1
     * @param children2
     * @public
     * @static
     */
    public static compareChildren<T extends IRate<IModel>>(
        type: Status,
        children1: IWeightTreeModel[],
        children2: IWeightTreeModel[],
        createRate: (tree1: IWeightTreeModel, tree2: IWeightTreeModel) => T
    ): T[] {
        let result: IRateMap<IWeightTreeModel>[];
        if (type === Status.FULL) {
            result = MergeUtils.fullMerge<IWeightTreeModel>(children1, children2);
        } else if (type === Status.PARTLY) {
            result = MergeUtils.partlyMerge<IWeightTreeModel>(children1, children2);
        } else {
            result = MergeUtils.notMerge<IWeightTreeModel>(children1, children2);
        }
        const children: T[] = [];
        for (const item of result) {
            children.push(
                ComparePolicyUtils.compareTree(item.left, item.right, createRate)
            );
        }
        return children;
    }

    /**
     * Compare two array (without children)
     * @param type
     * @param children1
     * @param children2
     * @param options
     * @public
     * @static
     */
    public static compareArray(
        children1: IWeightModel[],
        children2: IWeightModel[],
        options: ICompareOptions
    ): IRate<any>[] {
        const result = MergeUtils.partlyMerge<IWeightModel>(children1, children2);
        const rates: IRate<any>[] = [];
        for (const item of result) {
            const rate = new ObjectRate(item.left, item.right);
            rate.calc(options);
            rates.push(rate);
        }
        return rates;
    }
}