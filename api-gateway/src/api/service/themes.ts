import { Logger } from '@guardian/common';
import { Guardians } from '../../helpers/guardians.js';
import { Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Post, Put, Req, Response } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth } from '../../auth/auth.decorator.js';
import { UserRole } from '@guardian/interfaces';
import { getCacheKey } from '../../helpers/interceptors/utils/index.js';
import { CacheService } from '../../helpers/cache-service.js';
import { UseCache } from '../../helpers/decorators/cache.js';
import { PREFIXES } from '../../constants/index.js';

@Controller('themes')
@ApiTags('themes')
export class ThemesApi {
    constructor(private readonly cacheService: CacheService) {
    }

    @Post('/')
    @HttpCode(HttpStatus.CREATED)
    @Auth(UserRole.STANDARD_REGISTRY, UserRole.AUDITOR, UserRole.USER)
    async setThemes(@Req() req, @Response() res): Promise<any> {
        try {
            const guardians = new Guardians();
            const item = await guardians.createTheme(req.body, req.user.did);
            await this.cacheService.invalidate(getCacheKey([req.url], req.user))
            return res.status(201).send(item);
        } catch (error) {
            await (new Logger()).error(error, ['API_GATEWAY']);
            throw error;
        }
    }

    @Put('/:themeId')
    @HttpCode(HttpStatus.OK)
    @Auth(UserRole.STANDARD_REGISTRY, UserRole.AUDITOR, UserRole.USER)
    async updateTheme(@Req() req, @Response() res): Promise<any> {
        try {
            const user = req.user;
            const newTheme = req.body;
            const guardians = new Guardians();
            if (!req.params.themeId) {
                throw new HttpException('Invalid theme id', HttpStatus.UNPROCESSABLE_ENTITY)
            }
            const oldTheme = await guardians.getThemeById(req.params.themeId);
            if (!oldTheme) {
                throw new HttpException('Theme not found.', HttpStatus.NOT_FOUND)
            }
            const theme = await guardians.updateTheme(req.params.themeId, newTheme, user.did);

            const invalidedCacheKeys = [
              `${PREFIXES.THEMES}${req.params.themeId}/export/file`,
            ];

            await this.cacheService.invalidate(getCacheKey([req.url, invalidedCacheKeys], user))
            return res.send(theme);
        } catch (error) {
            new Logger().error(error, ['API_GATEWAY']);
            throw error;
        }
    }

    @Delete('/:themeId')
    @HttpCode(HttpStatus.OK)
    @Auth(UserRole.STANDARD_REGISTRY, UserRole.AUDITOR, UserRole.USER)
    async deleteTheme(@Req() req, @Response() res): Promise<any> {
        try {
            const guardians = new Guardians();
            if (!req.params.themeId) {
                throw new HttpException('Invalid theme id', HttpStatus.UNPROCESSABLE_ENTITY)
            }
            const result = await guardians.deleteTheme(req.params.themeId, req.user.did);

            const invalidedCacheKeys = [
              `${PREFIXES.THEMES}${req.params.themeId}/export/file`,
            ];

            await this.cacheService.invalidate(getCacheKey([req.url, invalidedCacheKeys], req.user))
            return res.send(result);
        } catch (error) {
            await (new Logger()).error(error, ['API_GATEWAY']);
            throw error;
        }
    }

    @Get('/')
    @HttpCode(HttpStatus.OK)
    @Auth(UserRole.STANDARD_REGISTRY, UserRole.AUDITOR, UserRole.USER)
    @UseCache()
    async getThemes(@Req() req, @Response() res): Promise<any> {
        try {
            const user = req.user;
            const guardians = new Guardians();
            if (user.did) {
                const themes = await guardians.getThemes(user.did);
                return res.send(themes);
            }
            return res.send([]);
        } catch (error) {
            new Logger().error(error, ['API_GATEWAY']);
            throw error
        }
    }

    @Post('/import/file')
    @HttpCode(HttpStatus.CREATED)
    @Auth(UserRole.STANDARD_REGISTRY, UserRole.AUDITOR, UserRole.USER)
    async importTheme(@Req() req, @Response() res): Promise<any> {
        const guardian = new Guardians();
        try {
            const theme = await guardian.importThemeFile(req.body, req.user.did);
            return res.status(201).send(theme);
        } catch (error) {
            new Logger().error(error, ['API_GATEWAY']);
            throw error;
        }
    }

    @Get('/:themeId/export/file')
    @HttpCode(HttpStatus.OK)
    @Auth(UserRole.STANDARD_REGISTRY, UserRole.AUDITOR, UserRole.USER)
    @UseCache()
    async exportTheme(@Req() req, @Response() res): Promise<any> {
        const guardian = new Guardians();
        try {
            const file: any = await guardian.exportThemeFile(req.params.themeId, req.user.did);
            res.header('Content-disposition', `attachment; filename=theme_${Date.now()}`);
            res.header('Content-type', 'application/zip');
            return res.send(file);
        } catch (error) {
            new Logger().error(error, ['API_GATEWAY']);
            throw error;
        }
    }
}
