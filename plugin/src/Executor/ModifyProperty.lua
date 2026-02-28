local PathResolver = require(script.Parent.Parent.PathResolver)

local function toVector3(v)
	if type(v) == "table" and #v >= 3 then
		return Vector3.new(v[1], v[2], v[3])
	end
	return nil
end

local function toColor3(v)
	if type(v) == "table" and #v >= 3 then
		return Color3.fromRGB(v[1], v[2], v[3])
	end
	return nil
end

local function enumFromString(instance, property, enumName)
	local enumType = Enum[property]
	if enumType and enumType[enumName] then
		return enumType[enumName]
	end
	return nil
end

return function(inst)
	local target, err = PathResolver.resolve(inst.path)
	if not target then
		return { success = false, error = err }
	end

	local prop = inst.property
	local value = inst.value

	if prop == "Position" or prop == "Size" then
		value = toVector3(value)
	elseif prop == "Color" then
		value = toColor3(value)
	elseif prop == "BrickColor" and type(value) == "string" then
		value = BrickColor.new(value)
	elseif type(value) == "table" and value.enumType and value.value then
		value = enumFromString(target, value.enumType, value.value)
	end

	target[prop] = value
	return { success = true, path = PathResolver.pathOf(target) }
end
