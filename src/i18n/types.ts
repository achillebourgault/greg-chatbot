export type I18nParams = Record<string, unknown>;

export type DictValue = string | ((params: I18nParams) => string);

export type Dict = Record<string, DictValue>;
