def hot_fold(count):
    value = 0
    for index in range(count):
        value = (value + index) % 65537
    return value

