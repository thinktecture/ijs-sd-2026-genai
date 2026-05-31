import { Component, OnInit, signal } from '@angular/core';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatListOption, MatSelectionList } from '@angular/material/list';
import { MatFormField } from '@angular/material/form-field';
import { MatInput, MatInputModule } from '@angular/material/input';
import { MatButton, MatFabButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TodoDto } from './todo.dto';
import { LlmService } from '../llm.service';
import {TODO_TOOL} from './tools';

@Component({
  selector: 'app-todo',
  imports: [
    MatSelectionList,
    MatListOption,
    MatProgressBar,
    MatButton,
    MatIcon,
    MatFormField,
    MatInput,
    MatInputModule,
    MatFabButton,
  ],
  templateUrl: './todo.html',
  styleUrl: './todo.scss'
})
export class Todo implements OnInit {
  protected llmService = new LlmService();
  // LAB #3, #4

  async ngOnInit() {
    // LAB #2
  }

  async runPrompt(userPrompt: string, inferenceEngine: string) {
    // LAB #3, #9
  }

  inferTransformersJs(userPrompt: string) {
    // LAB #3, #6, #7, #8, #9
  }

  async* inferPromptApi(userPrompt: string): AsyncGenerator<string> {
    // LAB #12
  }

  addTodo(text: string | null = null) {
    // LAB #4, #9
  }
}
