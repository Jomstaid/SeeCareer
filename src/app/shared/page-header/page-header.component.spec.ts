import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../shared.module';
import { PageHeaderComponent } from './page-header.component';

describe('PageHeaderComponent', () => {
  let fixture: ComponentFixture<PageHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SharedModule, RouterModule.forRoot([])] }).compileComponents();
    fixture = TestBed.createComponent(PageHeaderComponent);
  });

  it('shows the title it is given', async () => {
    fixture.componentRef.setInput('title', 'About Our Group');
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('About Our Group');
  });
});
