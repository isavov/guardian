import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
    selector: 'did-document-details',
    templateUrl: './did-document-details.component.html',
    styleUrl: './did-document-details.component.scss',
    standalone: true,
    imports: [
        CommonModule,
        MatProgressSpinnerModule
    ]
})
export class DidDocumentDetailsComponent {
    public loading: boolean = true;

    constructor(
        private route: ActivatedRoute,
        private router: Router
    ) {
    }

    ngOnInit() {
        this.loading = false;
        this.route.queryParams.subscribe(params => { });
    }

    ngOnDestroy(): void {

    }
}
