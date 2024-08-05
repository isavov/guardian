import { Component, Input, OnInit } from '@angular/core';
import { PolicyEngineService } from 'src/app/services/policy-engine.service';
import { PolicyHelper } from 'src/app/services/policy-helper.service';
import { WebSocketService } from 'src/app/services/web-socket.service';

/**
 * Component for display block of 'requestVcDocument' type.
 */
@Component({
    selector: 'dropdown-block-addon',
    templateUrl: './dropdown-block-addon.component.html',
    styleUrls: ['./dropdown-block-addon.component.scss'],
})
export class DropdownBlockAddonComponent implements OnInit {
    @Input('id') id!: string;
    @Input('policyId') policyId!: string;
    @Input('static') static!: any;

    loading: boolean = true;
    socket: any;
    data: any;
    uiMetaData: any;
    type: any;
    options: any;
    field: any;
    value: any;
    visible: any;
    content: any;
    target: any;
    currentValue: any;

    constructor(
        private policyEngineService: PolicyEngineService,
        private wsService: WebSocketService,
        private policyHelper: PolicyHelper
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
            this.type = data.type;
            this.uiMetaData = data.uiMetaData;

            this.field = data.field;
            this.options = data.options || [];
            this.currentValue = this.data?.id;
        } else {
            this.data = null;
        }
    }

    onDropdown(result: any) {
        this.loading = true;
        this.policyEngineService
            .setBlockData(this.id, this.policyId, {
                documentId: this.data?.id,
                dropdownDocumentId: result
            })
            .subscribe(
                () => {},
                (e) => {
                    console.error(e.error);
                    this.loading = false;
                }
            );
    }
}
