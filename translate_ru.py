import json

# Read both input files
with open('/tmp/lp/en_A.json', 'r') as f:
    a_data = json.load(f)
with open('/tmp/lp/en_B.json', 'r') as f:
    b_data = json.load(f)

# Complete translation map for file A
ru_a = {
  "common": {
    "appName": "Qlicker",
    "loading": "Загрузка…",
    "cancel": "Отмена",
    "close": "Закрыть",
    "delete": "Удалить",
    "remove": "Убрать",
    "save": "Сохранить",
    "saving": "Сохранение…",
    "edit": "Редактировать",
    "add": "Добавить",
    "create": "Создать",
    "copy": "Копировать",
    "view": "Просмотр",
    "proceed": "Продолжить",
    "search": "Поиск",
    "retry": "Повторить",
    "or": "или",
    "yes": "Да",
    "no": "Нет",
    "unknown": "Неизвестно",
    "back": "Назад",
    "next": "Далее",
    "previous": "Предыдущий",
    "paginationSummary": "Страница {{page}} из {{pages}}",
    "searchSessions": "Поиск сессий",
    "sessionTools": "Инструменты сессии",
    "required": "обязательно",
    "actions": "Действия",
    "status": "Статус",
    "name": "Имя",
    "email": "Электронная почта",
    "count": "Количество",
    "points": "Баллы",
    "date": "Дата",
    "hour": "Час",
    "minute": "Минута",
    "period": "Период",
    "am": "AM",
    "pm": "PM",
    "solution": "Решение",
    "noContent": "(нет содержимого)",
    "noAnswer": "(нет ответа)",
    "moveUp": "Переместить вверх",
    "moveDown": "Переместить вниз",
    "moreActions": "Ещё действия",
    "removeOption": "Удалить вариант",
    "approve": "Одобрить",
    "makePublic": "Сделать публичным",
    "confirmRename": "Подтвердить переименование",
    "cancelRename": "Отменить переименование",
    "rename": "Переименовать",
    "removeInstructor": "Удалить преподавателя",
    "openReview": "Открыть обзор",
    "recalculate": "Пересчитать",
    "copySession": "Копировать сессию",
    "verifyEmail": "Подтвердить электронную почту",
    "deleteUser": "Удалить пользователя",
    "deleteSession": "Удалить сессию",
    "option": "Вариант {{letter}}",
    "ta": "Ассистент",
    "redirecting": "Перенаправление…",
    "confirm": "Подтвердить"
  },
  "autoSave": {
    "errorNotSaved": "Не удалось сохранить изменения. Ваше последнее изменение не было записано.",
    "saved": "Изменения сохранены"
  },
  "connection": {
    "serverUnavailable": "Не удаётся подключиться к серверу. Некоторые функции могут быть недоступны."
  },
  "sessionChat": {
    "failedToLoad": "Не удалось загрузить чат сессии.",
    "failedToSend": "Не удалось отправить сообщение.",
    "failedToVote": "Не удалось обновить голос.",
    "failedToDismiss": "Не удалось отклонить сообщение.",
    "failedToDelete": "Не удалось удалить сообщение.",
    "failedToComment": "Не удалось добавить комментарий.",
    "disabled": "Чат сессии в настоящее время отключён.",
    "studentNotice": "Сообщения анонимны для остальных студентов, но преподаватель может видеть, кто их написал.",
    "chat": "Чат",
    "enableSessionChat": "Включить чат сессии",
    "enableRichTextChat": "Включить форматированный чат",
    "disableRichTextChat": "Отключить форматированный чат",
    "quickPosts": "Быстрые сообщения",
    "quickPostLabel": "Я не понял(а) вопрос {{questionNumber}}",
    "quickPostChip": "Быстрое сообщение",
    "quickPostPrompt": "Нужно дополнительное объяснение?",
    "quickPostHelper": "Выберите предыдущий вопрос, чтобы добавить свой голос к общему запросу на разъяснение.",
    "quickPostQuestionLabel": "Предыдущий вопрос",
    "requestQuickPost": "Запросить объяснение",
    "undoQuickPost": "Отменить запрос",
    "newPost": "Новое сообщение",
    "showComposer": "Написать сообщение",
    "hideComposer": "Скрыть редактор",
    "postPlaceholder": "Поделитесь отзывом или задайте вопрос…",
    "postEditorAria": "Редактор сообщений чата сессии",
    "post": "Отправить",
    "sending": "Отправка…",
    "comments": "Комментарии",
    "commentsCount_one": "{{count}} комментарий",
    "commentsCount_other": "{{count}} комментариев",
    "addComment": "Добавить комментарий",
    "commentPlaceholder": "Написать комментарий…",
    "commentEditorAria": "Редактор комментариев чата сессии",
    "comment": "Комментарий",
    "richTextDisabledStudentNotice": "Форматированный чат отключён. Сейчас доступны только быстрые сообщения.",
    "richTextDisabledInstructorNotice": "Форматированный чат отключён. Новые сообщения и комментарии отключены.",
    "commentsDisabledNotice": "Комментирование отключено, пока форматированный чат выключен.",
    "upvotes_one": "{{count}} голос «за»",
    "upvotes_other": "{{count}} голосов «за»",
    "upvote": "Голосовать «за»",
    "undoVote": "Отменить голос",
    "dismiss": "Отклонить",
    "dismissed": "Отклонено",
    "noPosts": "Сообщений пока нет.",
    "anonymousStudent": "Анонимный студент",
    "instructor": "Преподаватель",
    "system": "Система",
    "unknownAuthor": "Неизвестный автор",
    "reviewNote": "Отклонённые сообщения остаются видимыми здесь для обзора сессии."
  },
  "accessDenied": {
    "title": "Доступ запрещён",
    "message": "У вас нет прав для просмотра этой страницы."
  },
  "sessionStatus": {
    "draft": "Черновик",
    "upcoming": "Предстоящая",
    "live": "В эфире",
    "ended": "Завершена",
    "unknown": "Неизвестно",
    "running": "Идёт",
    "done": "Завершена",
    "hidden": "Скрытая",
    "visible": "Видимая"
  },
  "nav": {
    "skipToMain": "Перейти к основному содержимому",
    "goToDashboard": "Перейти на панель управления",
    "openAccountMenu": "Открыть меню учётной записи",
    "dashboard": "Панель управления",
    "profile": "Профиль",
    "courses": "Курсы",
    "logout": "Выйти",
    "userManual": "Руководство пользователя",
    "openAccountMenuTooltip": "Открыть меню учётной записи и быстрые ссылки"
  },
  "dashboard": {
    "liveSessions": "Активные сессии",
    "courses": "Курсы"
  },
  "sessionTiming": {
    "quizStartsAt": "Тест начинается: {{dateTime}}",
    "quizEndsAt": "Тест заканчивается: {{dateTime}}",
    "quizEndedAt": "Тест завершён: {{dateTime}}"
  },
  "home": {
    "tagline": "Образовательное программное обеспечение с открытым исходным кодом под вашим контролем",
    "subtitle": "Отвечайте. Учитесь.",
    "description": "Опросы в аудитории, домашние тесты, практические сессии для студентов, управление оценками, статистика и многое другое. Всё под рукой и бесплатно!",
    "getStarted": "Начать",
    "motionNote": "Анимация учитывает настройку `prefers-reduced-motion`.",
    "phoneAlt": "Телефон с приложением Qlicker"
  },
  "auth": {
    "email": "Электронная почта",
    "password": "Пароль",
    "loggingIn": "Вход в систему…",
    "login": "Войти",
    "register": "Регистрация",
    "forgotPassword": "Забыли пароль?",
    "backToSSO": "Вернуться к входу через SSO",
    "loginThrough": "Войти через {{institution}}",
    "haveEmailAccount": "Есть учётная запись на основе электронной почты",
    "firstName": "Имя",
    "lastName": "Фамилия",
    "creatingAccount": "Создание учётной записи…",
    "createAccount": "Создать учётную запись",
    "forgotPasswordTitle": "Забыли пароль",
    "forgotPasswordMessage": "Введите адрес электронной почты, и мы отправим вам ссылку для сброса пароля.",
    "resetLinkSent": "Если этот адрес зарегистрирован, ссылка для сброса была отправлена. Пожалуйста, проверьте папку «Спам», если вы не видите письмо во входящих.",
    "resetEmailFailed": "Не удалось отправить письмо для сброса. Пожалуйста, попробуйте ещё раз.",
    "sending": "Отправка…",
    "sendResetLink": "Отправить ссылку для сброса",
    "forgotPasswordSsoNotice": "При включённом SSO письмо для сброса пароля доступно только для учётных записей, которым администратор явно разрешил вход по электронной почте.",
    "ssoDefault": "SSO"
  },
  "resetPassword": {
    "title": "Сброс пароля",
    "passwordsNoMatch": "Пароли не совпадают",
    "passwordTooShort": "Пароль должен содержать не менее 6 символов",
    "passwordReset": "Пароль был сброшен. Теперь вы можете войти в систему.",
    "invalidLink": "Недействительная или просроченная ссылка для сброса",
    "newPassword": "Новый пароль",
    "confirmPassword": "Подтвердите пароль",
    "resetting": "Сброс…",
    "goToLogin": "Перейти ко входу"
  },
  "verifyEmail": {
    "title": "Подтверждение электронной почты",
    "invalidLink": "Недействительная или просроченная ссылка для подтверждения",
    "verified": "Электронная почта подтверждена! Теперь вы можете войти в систему.",
    "goToLogin": "Перейти ко входу"
  },
  "ssoCallback": {
    "noToken": "Токен аутентификации не получен",
    "authFailed": "Ошибка аутентификации",
    "profileFailed": "Не удалось загрузить профиль пользователя"
  },
  "profile": {
    "title": "Профиль",
    "photo": "Фото профиля",
    "uploading": "Загрузка…",
    "uploadPhoto": "Загрузить фото",
    "personalInfo": "Личная информация",
    "adjustPhoto": "Настроить фото профиля",
    "photoCropHelp": "Перетащите изображение, чтобы выбрать область для аватара. Поворот изменяет только миниатюру аватара; полноразмерное фото остаётся без изменений.",
    "profileImagePreview": "Предпросмотр изображения профиля",
    "rotateLeft": "Повернуть изображение влево",
    "rotateRight": "Повернуть изображение вправо",
    "photoClickHelp": "Нажмите на текущее фото, чтобы настроить миниатюру аватара, или загрузите новое изображение для замены.",
    "openPhotoEditor": "Открыть редактор фото профиля",
    "ssoNameManagedNote": "Изменение имени отключено, пока SSO обеспечивает вход для этой учётной записи.",
    "ssoPasswordManagedNote": "Изменение пароля отключено, пока SSO обеспечивает вход для этой учётной записи.",
    "ssoEmailLoginApprovalNote": "Администратор должен разрешить вход по электронной почте для этой учётной записи, прежде чем можно будет использовать сброс пароля или вход по электронной почте.",
    "firstName": "Имя",
    "lastName": "Фамилия",
    "employeeNumber": "Табельный номер",
    "studentNumber": "Студенческий номер",
    "changePassword": "Изменить пароль",
    "currentPassword": "Текущий пароль",
    "newPassword": "Новый пароль",
    "confirmNewPassword": "Подтвердите новый пароль",
    "changingPassword": "Изменение…",
    "passwordsNoMatch": "Новые пароли не совпадают",
    "passwordTooShort": "Новый пароль должен содержать не менее 6 символов",
    "passwordChanged": "Пароль изменён",
    "profileFailed": "Не удалось обновить профиль.",
    "lastChangeNotRecorded": "Ваше последнее изменение не было записано.",
    "photoUpdated": "Фото профиля обновлено",
    "photoFailed": "Не удалось загрузить фото",
    "language": "Язык",
    "languageHelp": "Выберите предпочитаемый язык. Выберите «По умолчанию», чтобы следовать системной настройке, установленной вашим администратором.",
    "useAppDefault": "По умолчанию",
    "failedChangePassword": "Не удалось изменить пароль"
  }
}

# Write file A
with open('/tmp/lp/ru_A.json', 'w', encoding='utf-8') as f:
    json.dump(ru_a, f, ensure_ascii=False, indent=2)

# Verify A key counts
def count_leaves(obj):
    if isinstance(obj, dict):
        total = 0
        for v in obj.values():
            total += count_leaves(v)
        return total
    return 1

a_en_count = count_leaves(a_data)
a_ru_count = count_leaves(ru_a)
print(f"en_A leaves: {a_en_count}, ru_A leaves: {a_ru_count}, match: {a_en_count == a_ru_count}")

# Verify structure matches
def get_keys(obj, prefix=''):
    keys = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            keys.update(get_keys(v, prefix + k + '.'))
    else:
        keys.add(prefix[:-1])
    return keys

en_keys = get_keys(a_data)
ru_keys = get_keys(ru_a)
missing = en_keys - ru_keys
extra = ru_keys - en_keys
if missing:
    print(f"MISSING keys in ru_A: {missing}")
if extra:
    print(f"EXTRA keys in ru_A: {extra}")

# Validate JSON roundtrip
with open('/tmp/lp/ru_A.json', 'r', encoding='utf-8') as f:
    json.load(f)
print("ru_A.json is valid JSON")
