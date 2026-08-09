const EXPECTED = Dict(
    "nbody" => -0.16908926275527303,
    "matrix_multiplication" => 166742891853.24692,
)

function initial_state()
    days = 365.24
    solar_mass = 4.0 * pi * pi
    state = Float64[
        0, 0, 0, 0, 0, 0, solar_mass,
        4.84143144246472090, -1.16032004402742839,
        -1.03622044471123109e-1,
        1.66007664274403694e-3 * days,
        7.69901118419740425e-3 * days,
        -6.90460016972063023e-5 * days,
        9.54791938424326609e-4 * solar_mass,
        8.34336671824457987, 4.12479856412430479,
        -4.03523417114321381e-1,
        -2.76742510726862411e-3 * days,
        4.99852801234917238e-3 * days,
        2.30417297573763929e-5 * days,
        2.85885980666130812e-4 * solar_mass,
        1.28943695621391310e1, -1.51111514016986312e1,
        -2.23307578892655734e-1,
        2.96460137564761618e-3 * days,
        2.37847173959480950e-3 * days,
        -2.96589568540237556e-5 * days,
        4.36624404335156298e-5 * solar_mass,
        1.53796971148509165e1, -2.59193146099879641e1,
        1.79258772950371181e-1,
        2.68067772490389322e-3 * days,
        1.62824170038242295e-3 * days,
        -9.51592254519715870e-5 * days,
        5.15138902046611451e-5 * solar_mass,
    ]
    px = py = pz = 0.0
    for body in 0:4
        start = body * 7
        mass = state[start + 7]
        px -= state[start + 4] * mass
        py -= state[start + 5] * mass
        pz -= state[start + 6] * mass
    end
    state[4] = px / solar_mass
    state[5] = py / solar_mass
    state[6] = pz / solar_mass
    state
end

function nbody_advance_energy(state, dt, steps, bodies)
    for _step in 1:steps
        for left_index in 0:(bodies - 1)
            left = left_index * 7
            for right_index in (left_index + 1):(bodies - 1)
                right = right_index * 7
                dx = state[left + 1] - state[right + 1]
                dy = state[left + 2] - state[right + 2]
                dz = state[left + 3] - state[right + 3]
                distance_squared = dx * dx + dy * dy + dz * dz
                magnitude = dt / (distance_squared * sqrt(distance_squared))
                left_mass_magnitude = state[left + 7] * magnitude
                right_mass_magnitude = state[right + 7] * magnitude
                state[left + 4] -= dx * right_mass_magnitude
                state[left + 5] -= dy * right_mass_magnitude
                state[left + 6] -= dz * right_mass_magnitude
                state[right + 4] += dx * left_mass_magnitude
                state[right + 5] += dy * left_mass_magnitude
                state[right + 6] += dz * left_mass_magnitude
            end
        end
        for body_index in 0:(bodies - 1)
            body = body_index * 7
            state[body + 1] += dt * state[body + 4]
            state[body + 2] += dt * state[body + 5]
            state[body + 3] += dt * state[body + 6]
        end
    end
    energy = 0.0
    for left_index in 0:(bodies - 1)
        left = left_index * 7
        for right_index in (left_index + 1):(bodies - 1)
            right = right_index * 7
            dx = state[left + 1] - state[right + 1]
            dy = state[left + 2] - state[right + 2]
            dz = state[left + 3] - state[right + 3]
            distance_squared = dx * dx + dy * dy + dz * dz
            energy -= state[left + 7] * state[right + 7] /
                sqrt(distance_squared)
        end
        energy += state[left + 7] * (
            state[left + 4]^2 + state[left + 5]^2 + state[left + 6]^2) / 2.0
    end
    energy
end

function matrix_inputs()
    size = 30
    left = [mod(index * 17 + 3, 97) / 97.0 for index in 0:(size^2 - 1)]
    right = [mod(index * 19 + 5, 89) / 890.0 for index in 0:(size^2 - 1)]
    left, right, zeros(Float64, size^2)
end

function matrix_multiply_repeated(left, right, scratch, size, repetitions)
    current = left
    target = scratch
    for _repeat in 1:repetitions
        for row in 0:(size - 1)
            for column in 0:(size - 1)
                accumulator = 0.0
                for index in 0:(size - 1)
                    accumulator += current[row * size + index + 1] *
                        right[index * size + column + 1]
                end
                target[row * size + column + 1] = accumulator
            end
        end
        current, target = target, current
    end
    sum(current)
end

function prepare(identifier)
    if identifier == "nbody"
        return nbody_advance_energy, (initial_state(), 0.01, 20000, 5)
    end
    left, right, scratch = matrix_inputs()
    matrix_multiply_repeated, (left, right, scratch, 30, 50)
end

function close(actual, expected)
    abs(actual - expected) <= 1e-12 * max(1.0, abs(expected))
end

warmups = parse(Int, get(ENV, "SAGEJS_BUFFER_WARMUPS", "1"))
samples = parse(Int, get(ENV, "SAGEJS_BUFFER_SAMPLES", "3"))
selected = split(get(
    ENV, "SAGEJS_BUFFER_ONLY", "nbody,matrix_multiplication"), ",")
println("SAGEJS_COWASM_BUFFERS 1")
for (kind, count) in (("WARMUP", warmups), ("RESULT", samples))
    for sample in 0:(count - 1)
        for identifier in selected
            operation, arguments = prepare(identifier)
            started = time_ns()
            answer = operation(arguments...)
            elapsed = time_ns() - started
            close(answer, EXPECTED[identifier]) || error(
                "$identifier returned $answer; expected $(EXPECTED[identifier])")
            println("$kind\t$sample\t$identifier\t$elapsed\tok")
        end
    end
end
println("COMPLETE\t$warmups\t$samples\t$(length(selected))")
