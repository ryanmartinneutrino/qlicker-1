"use strict";
// Shared configuration constants, migrated from imports/configs.js
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_STATUS_STRINGS = exports.SA_ORDER = exports.TF_ORDER = exports.MC_ORDER = exports.QUESTION_TYPE_STRINGS_SHORT = exports.QUESTION_TYPE_STRINGS = exports.SessionStatus = exports.UserRole = exports.QuestionType = void 0;
exports.isAutoGradeable = isAutoGradeable;
var QuestionType;
(function (QuestionType) {
    QuestionType[QuestionType["MC"] = 0] = "MC";
    QuestionType[QuestionType["TF"] = 1] = "TF";
    QuestionType[QuestionType["SA"] = 2] = "SA";
    QuestionType[QuestionType["MS"] = 3] = "MS";
    QuestionType[QuestionType["NU"] = 4] = "NU";
})(QuestionType || (exports.QuestionType = QuestionType = {}));
var UserRole;
(function (UserRole) {
    UserRole["student"] = "student";
    UserRole["prof"] = "professor";
    UserRole["admin"] = "admin";
})(UserRole || (exports.UserRole = UserRole = {}));
var SessionStatus;
(function (SessionStatus) {
    SessionStatus["hidden"] = "hidden";
    SessionStatus["visible"] = "visible";
    SessionStatus["running"] = "running";
    SessionStatus["done"] = "done";
})(SessionStatus || (exports.SessionStatus = SessionStatus = {}));
exports.QUESTION_TYPE_STRINGS = [
    'Multiple Choice',
    'True/False',
    'Short Answer',
    'Multi Select',
    'Numerical',
];
exports.QUESTION_TYPE_STRINGS_SHORT = ['MC', 'TF', 'SA', 'MS', 'NU'];
exports.MC_ORDER = ['A', 'B', 'C', 'D', 'E', 'F'];
exports.TF_ORDER = ['TRUE', 'FALSE'];
exports.SA_ORDER = ['ANSWER'];
exports.SESSION_STATUS_STRINGS = {
    hidden: 'Draft',
    visible: 'Upcoming',
    running: '• Live',
    done: 'Ended',
    submitted: 'Submitted',
};
/** Whether or not a question type can be automatically graded */
function isAutoGradeable(type) {
    switch (type) {
        case QuestionType.MC:
            return true;
        case QuestionType.TF:
            return true;
        case QuestionType.SA:
            return false;
        case QuestionType.MS:
            return true;
        case QuestionType.NU:
            return true;
        default:
            return false;
    }
}
//# sourceMappingURL=configs.js.map