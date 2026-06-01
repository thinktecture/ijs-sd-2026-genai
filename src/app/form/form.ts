import { Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-form',
  imports: [
    ReactiveFormsModule,
  ],
  templateUrl: './form.html',
  styleUrl: './form.scss'
})
export class Form {
  // LAB #13, #14, #15, #16, #17, #18
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly formGroup = this.fb.group({
    name: '',
    city: '',
  });

  async fillForm(value: string) {}
}