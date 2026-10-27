import { Body, Controller, Delete, Get, Header, Inject, Param, ParseIntPipe, Post, Query, BadRequestException } from '@nestjs/common';
import { CompanionService } from '../services/companion.service';
// 全体のGoogleAccessGuardが他のAPIと同様に認証・許可済みアカウントだけを通す。
@Controller('companion')
export class CompanionController {
  constructor(@Inject(CompanionService) private readonly service: CompanionService) {}
  @Post('chat') @Header('Cache-Control', 'no-store')
  chat(@Body() input: unknown) { return this.service.chat(input); }
  @Get('notes') @Header('Cache-Control', 'no-store')
  notes() { return this.service.listNotes(); }
  @Get('notes/calendar') @Header('Cache-Control', 'no-store')
  calendar(@Query('month') month: unknown) { return this.service.noteCalendar(month); }
  @Get('notes/day') @Header('Cache-Control', 'no-store')
  day(@Query('date') date: unknown, @Query('offset') offset: unknown) { return this.service.noteDay(date, offset); }
  @Post('notes') @Header('Cache-Control', 'no-store')
  save(@Body() input: unknown) { return this.service.saveNote(input); }
  @Delete('notes/:id') @Header('Cache-Control', 'no-store')
  remove(@Param('id', ParseIntPipe) id: number) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new BadRequestException('ノートIDが不正です。');
    this.service.deleteNote(id); return { deleted: true };
  }
}
