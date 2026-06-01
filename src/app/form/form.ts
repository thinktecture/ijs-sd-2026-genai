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

  async fillForm(value: string) {
    const languageModel = await LanguageModel.create({
      initialPrompts: [{
        role: 'system',
        content: `Extract the information to a JSON object of this shape: ${JSON.stringify(this.formGroup.value)}`,
      }],
    });
    const result = await languageModel.prompt(value, {
      responseConstraint: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          city: { type: 'string' },
        },
      },
    });
    console.log(result);
  }

  async paste() {
    const content = await navigator.clipboard.readText();
    await this.fillForm(content);
  }
}