local PathResolver = {}

local function split(path)
	local out = {}
	for part in string.gmatch(path, "[^%.]+") do
		table.insert(out, part)
	end
	return out
end

function PathResolver.resolve(pathString)
	if type(pathString) ~= "string" or pathString == "" then
		return nil, "Invalid path"
	end

	local parts = split(pathString)
	if #parts == 0 then
		return nil, "Empty path"
	end

	local cursor = nil
	if parts[1] == "game" then
		cursor = game
	elseif game:FindFirstChild(parts[1]) then
		cursor = game:FindFirstChild(parts[1])
	else
		return nil, "Root not found: " .. parts[1]
	end

	for i = 2, #parts do
		if not cursor then
			return nil, "Path broke at index " .. tostring(i)
		end
		cursor = cursor:FindFirstChild(parts[i])
		if not cursor then
			return nil, "Segment not found: " .. parts[i]
		end
	end

	return cursor
end

function PathResolver.pathOf(instance)
	if not instance then
		return ""
	end

	local parts = {}
	local cursor = instance
	while cursor and cursor ~= game do
		table.insert(parts, 1, cursor.Name)
		cursor = cursor.Parent
	end
	return table.concat(parts, ".")
end

return PathResolver
