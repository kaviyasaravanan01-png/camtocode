import json
import os

FILE_NAME = tasks.json

def load_tasks()
    if not os.path.exists(FILE_NAME)
        return []
    with open(FILE_NAME, r) as f
        return json.load(f)

def save_tasks(tasks)
    with open(FILE_NAME, w) as f
        json.dump(tasks, f, indent=4)

def add_task(title)
    tasks = load_tasks()
    task = {
        id len(tasks) + 1,
        title title,
        completed False
    }
    tasks.append(task)
    save_tasks(tasks)
    print(Task added.)

def list_tasks()
    tasks = load_tasks()
    if not tasks
        print(No tasks found.)
        return
    for t in tasks
        status = ✔ if t[completed] else ✘
        print(f'{t[id]}. {t[title]} [{status}]')

def complete_task(task_id)
    tasks = load_tasks()
    for t in tasks
        if t[id] == task_id
            t[completed] = True
            save_tasks(tasks)
            print(Task completed.)
            return
    print(Task not found.)

def delete_task(task_id)
    tasks = load_tasks()
    tasks = [t for t in tasks if t[id] != task_id]
    save_tasks(tasks)
    print(Task deleted.)

def menu()
    while True
        print(n1. Add Task)
        print(2. List Tasks)
        print(3. Complete Task)
        print(4. Delete Task)
        print(5. Exit)
        choice = input(Choose )

        if choice == 1
            title = input(Enter task )
            add_task(title)
        elif choice == 2
            list_tasks()
        elif choice == 3
            task_id = int(input(Enter ID ))
            complete_task(task_id)
        elif choice == 4
            task_id = int(input(Enter ID ))
            delete_task(task_id)
        elif choice == 5
            print(Goodbye!)
            break
        else
            print(Invalid choice.)

if __name__ == __main__
    menu()