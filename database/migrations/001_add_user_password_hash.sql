ALTER TABLE Users
  ADD COLUMN password_hash VARCHAR(255) NULL AFTER username;
