import { Component, Input, OnInit } from '@angular/core';
import { PolicyEngineService } from 'src/app/services/policy-engine.service';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { PolicyHelper } from 'src/app/services/policy-helper.service';
import { WebSocketService } from 'src/app/services/web-socket.service';
import { InviteDialogComponent } from 'src/app/policy-engine/helpers/invite-dialog/invite-dialog.component';
import { MatDialog } from '@angular/material/dialog';

/**
 * Component for display block of 'policyRolesBlock' types.
 */
@Component({
    selector: 'app-group-manager-block',
    templateUrl: './group-manager-block.component.html',
    styleUrls: ['./group-manager-block.component.css']
})
export class GroupManagerBlockComponent implements OnInit {
    @Input('id') id!: string;
    @Input('policyId') policyId!: string;
    @Input('static') static!: any;

    isActive = false;
    loading: boolean = true;
    socket: any;
    content: string | null = null;

    groups: any;
    users: any;
    selected: any;
    canInvite: any;
    canDelete: any;
    role: any;
    groupRelationshipType: any;
    groupAccessType: any;
    type: any;

    groupColumns: string[] = [
        'id',
        'groupLabel',
        'groupName',
        'role',
        'type',
        'actions'
    ];
    userColumns: string[] = [
        'username',
        'role',
        'type',
        'action'
    ];

    constructor(
        private policyEngineService: PolicyEngineService,
        private wsService: WebSocketService,
        private policyHelper: PolicyHelper,
        private fb: FormBuilder,
        private dialog: MatDialog
    ) {
    }

    ngOnInit(): void {
        if (!this.static) {
            this.socket = this.wsService.blockSubscribe(this.onUpdate.bind(this));
        }
        this.loadData();
    }

    ngOnDestroy(): void {
        if (this.socket) {
            this.socket.unsubscribe();
        }
    }

    onUpdate(id: string): void {
        if (this.id == id) {
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
            this.loading = true;
            this.policyEngineService.getBlockData(this.id, this.policyId).subscribe((data: any) => {
                this.setData(data);
                this.loading = false;
            }, (e) => {
                console.error(e.error);
                this.loading = false;
            });
        }
    }

    setData(data: any) {
        if (data) {
            this.selected = null;
            this.groups = data.data || [];
            this.isActive = true;
        } else {
            this.users = [];
            this.selected = null;
            this.canInvite = false;
            this.canDelete = false;
            this.role = '';
            this.groupRelationshipType = '';
            this.groupAccessType = '';
            this.content = null;
            this.isActive = false;
        }
    }

    onSelect(group: any) {
        this.selected = group;
        if (this.selected) {
            this.users = this.selected.data || [];
            this.canInvite = this.selected.canInvite || false;
            this.canDelete = this.selected.canDelete || false;
            this.role = this.selected.role || '';
            this.type = this.selected.type || '';
            this.groupRelationshipType = this.selected.groupRelationshipType;
            this.groupAccessType = this.selected.groupAccessType;
        }
    }

    onBack() {
        this.selected = null;
    }

    onActive(group: any) {

    }

    onInvite(group: any) {
        const dialogRef = this.dialog.open(InviteDialogComponent, {
            width: '500px',
            panelClass: 'g-dialog',
            disableClose: true,
            data: {
                header: 'Invitation',
                blockId: this.id, 
                policyId: this.policyId,
                group: group.id,
                roles: group.roles
            }
        });
        dialogRef.afterClosed().subscribe(async () => {
        });
    }

    onDelete(user: any) {
        this.loading = true;
        this.policyEngineService.setBlockData(this.id, this.policyId, {
            action: 'delete',
            username: user.username
        }).subscribe((result) => {
            this.loadData();
        }, (e) => {
            console.error(e.error);
            this.loading = false;
        });
    }
}
