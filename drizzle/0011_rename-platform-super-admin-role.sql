UPDATE "user"
SET "role" = array_to_string(
  array_replace(
    string_to_array("role", ','),
    'superAdmin',
    'platformSuperAdmin'
  ),
  ','
)
WHERE 'superAdmin' = ANY(string_to_array("role", ','));
