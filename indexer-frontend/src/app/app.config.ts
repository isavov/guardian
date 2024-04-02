import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { StatusService } from './services/status.service';
import { provideHttpClient } from '@angular/common/http';
import { LogsService } from './services/logs.service';

export const appConfig: ApplicationConfig = {
    providers: [
        StatusService,
        LogsService,
        provideHttpClient(),
        provideRouter(routes)
    ]
};
