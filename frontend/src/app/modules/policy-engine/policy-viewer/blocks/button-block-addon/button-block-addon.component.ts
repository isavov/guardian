import { AfterContentChecked, ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit, } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { PolicyEngineService } from 'src/app/services/policy-engine.service';
import { PolicyHelper } from 'src/app/services/policy-helper.service';
import { WebSocketService } from 'src/app/services/web-socket.service';
import { ConfirmationDialog } from '../confirmation-dialog/confirmation-dialog.component';
import { DialogService } from 'primeng/dynamicdialog';

/**
 * Component for display block of 'Buttons' type.
 */
@Component({
    selector: 'button-block-addon',
    templateUrl: './button-block-addon.component.html',
    styleUrls: ['./button-block-addon.component.scss'],
    //changeDetection: ChangeDetectionStrategy.OnPush
})
export class ButtonBlockAddonComponent implements OnInit {
    @Input('id') id!: string;
    @Input('policyId') policyId!: string;
    @Input('static') static!: any;

    loading: boolean = false;
    socket: any;
    data: any;
    visible: boolean = true;
    private readonly _commentField: string = 'option.comment';

    name?: string;
    uiClass?: string;
    dialog?: boolean;
    dialogOptions?: {
        dialogTitle?: string;
        dialogDescription?: string;
        resultOptionsFieldPath?: string;
    }

    constructor(
        private policyEngineService: PolicyEngineService,
        private wsService: WebSocketService,
        private policyHelper: PolicyHelper,
        private dialogService: DialogService,
        private cdref: ChangeDetectorRef
    ) {
    }

    ngOnInit(): void {
        if (!this.static) {
            this.socket = this.wsService.blockSubscribe(
                this.onUpdate.bind(this)
            );
        }
        this.loadData();
    }

    ngOnDestroy(): void {
        if (this.socket) {
            this.socket.unsubscribe();
        }
    }

    onUpdate(blocks: string[]): void {
        if (Array.isArray(blocks) && blocks.includes(this.id)) {
            this.loadData();
        }
    }

    loadData() {
        this.visible = true;
        this.loading = true;
        if (this.static) {
            this.setData(this.static);
            setTimeout(() => {
                this.loading = false;
            }, 500);
        } else {
            this.policyEngineService
                .getBlockData(this.id, this.policyId)
                .subscribe(
                    (data: any) => {
                        this.setData(data);
                        setTimeout(() => {
                            this.loading = false;
                        }, 1000);
                    },
                    (e) => {
                        console.error(e.error);
                        this.loading = false;
                    }
                );
        }
    }

    setData(data: any) {
        if (data) {
            this.data = data.data;
            this.name = data.name;
            this.uiClass = data.uiClass;
            this.dialog = data.dialog;
            this.dialogOptions = data.dialogOptions;
        } else {
            this.data = null;
        }
    }

    onSelect(dialogResult?: any) {
        this.visible = false;
        this.policyEngineService
            .setBlockData(this.id, this.policyId, {
                documentId: this.data?.id,
                dialogResult
            })
            .subscribe(
                // tslint:disable-next-line:no-empty
                () => { },
                (e) => {
                    console.error(e.error);
                    this.loading = false;
                }
            );
    }

    getObjectValue(data: any, value: any) {
        let result: any = null;
        if (data && value) {
            const keys = value.split('.');
            result = data;
            // tslint:disable-next-line:prefer-for-of
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                if (key === 'L' && Array.isArray(result)) {
                    result = result[result.length - 1];
                } else {
                    result = result[key];
                }
            }
        }
        return result;
    }

    onSelectDialog() {
        const dialogRef = this.dialogService.open(ConfirmationDialog, {
            header: this.dialogOptions!.dialogTitle,
            width: '100vh',
            data: {
                title: this.dialogOptions!.dialogTitle,
                description: this.dialogOptions!.dialogDescription,
            },
        });

        dialogRef.onClose.subscribe((result) => {
            if (result) {
                let comments = this.getObjectValue(
                    this.data,
                    `options.${this.dialogOptions!.resultOptionsFieldPath}` || this._commentField
                );
                if (Array.isArray(comments)) {
                    comments.push(result);
                } else {
                    comments = typeof comments === 'string'
                        ? [comments, result]
                        : [result];
                }
                this.onSelect(comments);
            }
        });
    }
}
