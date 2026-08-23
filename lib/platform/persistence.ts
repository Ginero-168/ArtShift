export interface PersistencePort {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const localStoragePersistence: PersistencePort = {
  async read(key) {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  },
  async write(key, value) {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  },
  async remove(key) {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  },
};
