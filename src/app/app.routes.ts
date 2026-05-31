import { Routes } from '@angular/router';
import { Form } from './form/form';
import { Todo } from './todo/todo';

export const routes: Routes = [
  { path: '', redirectTo: 'todo', pathMatch: 'full' },
  { path: 'todo', component: Todo },
  { path: 'form', component: Form },
];
