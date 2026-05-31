export const TODO_TOOL = {
  type: 'function',
  function: {
    name: 'addTodo',
    description: 'Add a new todo item.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The content of the todo item',
        },
      },
      required: ['text'],
    },
  },
};
